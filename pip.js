// Self-contained: scripting.executeScript serializes this function into the selected frame.
// Use native APIs; do not copy, move or re-create the site's video/player.
async function controlPictureInPicture(action = 'inspect') {
    const videos = [];
    function collect(root) {
        videos.push(...root.querySelectorAll('video'));
        root.querySelectorAll('*').forEach(element => {
            if (element.shadowRoot) collect(element.shadowRoot);
        });
    }
    collect(document);

    function isFloating(video) {
        return video.webkitPresentationMode === 'picture-in-picture'
            || video.getRootNode().pictureInPictureElement === video;
    }

    function hasSafariPiP(video) {
        return typeof video.webkitSetPresentationMode === 'function'
            && typeof video.webkitSupportsPresentationMode === 'function'
            && video.webkitSupportsPresentationMode('picture-in-picture');
    }

    function score(video) {
        if (isFloating(video)) return 3e12;
        const rect = video.getBoundingClientRect();
        const area = Math.min(Math.max(0, rect.width * rect.height), 1e9);
        return (!video.paused && !video.ended ? 1e12 : 0) + area;
    }

    const active = videos.find(isFloating);
    const loaded = videos.filter(video => video.readyState >= 1 && video.videoWidth > 0);
    const available = loaded.filter(video => {
        const style = getComputedStyle(video);
        const rect = video.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    });
    const supported = available.filter(video => hasSafariPiP(video)
        || (typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled));
    const video = active || supported.sort((a, b) => score(b) - score(a))[0];

    if (!video) {
        const error = !videos.length ? 'no-video' : !available.length ? 'not-ready'
            : available.some(video => typeof video.requestPictureInPicture === 'function')
                && document.pictureInPictureEnabled === false ? 'blocked' : 'unsupported';
        return { ok: false, error, hasVideo: available.length > 0, videoCount: videos.length };
    }

    if (action === 'inspect') return { ok: true, hasVideo: true, videoCount: videos.length, active: Boolean(active), score: score(video) };

    let restoreHint = () => {};
    try {
        if (active) {
            if (active.webkitPresentationMode === 'picture-in-picture') {
                active.webkitSetPresentationMode('inline');
            } else {
                await document.exitPictureInPicture();
            }
        } else {
            // disablePictureInPicture is a site's UI preference, not a permission.
            // Restore it on exit; browser/Permissions Policy restrictions remain enforced.
            if (video.hasAttribute('disablepictureinpicture')) {
                const value = video.getAttribute('disablepictureinpicture');
                restoreHint = () => {
                    video.setAttribute('disablepictureinpicture', value);
                    video.removeEventListener('leavepictureinpicture', onExit);
                    video.removeEventListener('webkitpresentationmodechanged', onExit);
                };
                const onExit = () => { if (!isFloating(video)) restoreHint(); };
                video.addEventListener('leavepictureinpicture', onExit);
                video.addEventListener('webkitpresentationmodechanged', onExit);
                video.removeAttribute('disablepictureinpicture');
            }
            if (hasSafariPiP(video)) {
                video.webkitSetPresentationMode('picture-in-picture');
            } else {
                await video.requestPictureInPicture();
            }
        }

        // Safari returns void and can silently refuse; confirm the actual presentation state.
        const expected = !active;
        if (isFloating(video) !== expected) {
            await new Promise(resolve => {
                const finish = () => {
                    clearTimeout(timer);
                    video.removeEventListener('webkitpresentationmodechanged', changed);
                    resolve();
                };
                const changed = () => { if (isFloating(video) === expected) finish(); };
                const timer = setTimeout(finish, 700);
                video.addEventListener('webkitpresentationmodechanged', changed);
                changed();
            });
        }
        if (isFloating(video) !== expected) {
            restoreHint();
            return { ok: false, error: 'interaction-required' };
        }
        return { ok: true, active: expected };
    } catch (error) {
        restoreHint();
        return { ok: false, error: error.name === 'NotAllowedError' ? 'interaction-required'
            : error.name === 'SecurityError' ? 'blocked'
            : error.name === 'InvalidStateError' ? 'not-ready' : 'failed' };
    }
}

function selectPictureInPictureFrame(results) {
    return results.filter(entry => entry.result?.ok)
        .sort((a, b) => b.result.score - a.result.score)[0];
}
