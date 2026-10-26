const extensionApi = globalThis.browser || globalThis.chrome;
const STYLE_ID = 'preencher-video-styles';
const VIDEO_CLASS = 'preencher-video-target';
const VALID_MODES = new Set(['original', 'cover', 'stretch', 'width', 'height']);

let settings = { isActive: true, mode: 'cover', playbackSpeed: 1 };
let settingsLoaded = false;
const observedVideos = new WeakSet();
const playbackStates = new WeakMap();
const resizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => updateVideo(entry.target));
});

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        video.${VIDEO_CLASS} {
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            max-height: none !important;
            object-position: center center !important;
        }
        video.${VIDEO_CLASS}[data-preencher-mode="cover"] {
            object-fit: cover !important;
        }
        video.${VIDEO_CLASS}[data-preencher-mode="stretch"] {
            object-fit: fill !important;
        }
        video.${VIDEO_CLASS}[data-preencher-mode="width"],
        video.${VIDEO_CLASS}[data-preencher-mode="height"] {
            object-fit: contain !important;
            scale: var(--preencher-video-scale, 1) !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function normalizeSpeed(value) {
    return Number.isFinite(value) && value >= 0.5 && value <= 2
        ? Math.round(value * 4) / 4 : 1;
}

function updatePlaybackSpeed(video) {
    try {
        if (!settings.isActive) {
            const previous = playbackStates.get(video);
            if (previous && video.playbackRate === previous.appliedRate) {
                video.playbackRate = previous.originalRate;
            }
            playbackStates.delete(video);
            return;
        }
        if (!playbackStates.has(video)) {
            playbackStates.set(video, { originalRate: video.playbackRate, appliedRate: null });
        }
        if (video.playbackRate !== settings.playbackSpeed) {
            video.playbackRate = settings.playbackSpeed;
        }
        playbackStates.get(video).appliedRate = video.playbackRate;
    } catch (error) {
        console.warn('O player não permitiu ajustar a velocidade:', error);
    }
}

function updateVideo(video) {
    if (!video.isConnected || !settingsLoaded) return;
    updatePlaybackSpeed(video);

    if (!settings.isActive || settings.mode === 'original') {
        video.classList.remove(VIDEO_CLASS);
        video.removeAttribute('data-preencher-mode');
        video.style.removeProperty('--preencher-video-scale');
        return;
    }

    installStyles();
    video.classList.add(VIDEO_CLASS);
    video.setAttribute('data-preencher-mode', settings.mode);

    if (settings.mode !== 'width' && settings.mode !== 'height') {
        video.style.removeProperty('--preencher-video-scale');
        return;
    }

    const width = video.clientWidth;
    const height = video.clientHeight;
    const naturalWidth = video.videoWidth;
    const naturalHeight = video.videoHeight;

    if (!width || !height || !naturalWidth || !naturalHeight) {
        video.style.setProperty('--preencher-video-scale', '1');
        return;
    }

    // O vídeo começa em "contain". Amplia até o conteúdo alcançar o eixo escolhido.
    const frameRatio = width / height;
    const videoRatio = naturalWidth / naturalHeight;
    const scale = settings.mode === 'width'
        ? Math.max(1, frameRatio / videoRatio)
        : Math.max(1, videoRatio / frameRatio);
    video.style.setProperty('--preencher-video-scale', String(scale));
}

function updateAllVideos() {
    document.querySelectorAll('video').forEach(video => {
        if (!observedVideos.has(video)) {
            observedVideos.add(video);
            resizeObserver.observe(video);
            video.addEventListener('loadedmetadata', () => updateVideo(video));
            video.addEventListener('play', () => updateVideo(video));
        }
        updateVideo(video);
    });
}

extensionApi.storage.local.get(['isActive', 'mode', 'playbackSpeed']).then(data => {
    settings = {
        isActive: data.isActive !== false,
        mode: VALID_MODES.has(data.mode) ? data.mode : 'cover',
        playbackSpeed: normalizeSpeed(data.playbackSpeed)
    };
    settingsLoaded = true;
    updateAllVideos();
}).catch(error => {
    console.error('Erro ao carregar preferências do vídeo:', error);
    settingsLoaded = true;
    updateAllVideos();
});

extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.isActive) settings.isActive = changes.isActive.newValue !== false;
    if (changes.mode) {
        settings.mode = VALID_MODES.has(changes.mode.newValue)
            ? changes.mode.newValue : 'cover';
    }
    if (changes.playbackSpeed) settings.playbackSpeed = normalizeSpeed(changes.playbackSpeed.newValue);
    updateAllVideos();
});

extensionApi.runtime.onMessage.addListener(message => {
    if (message?.type === 'reapply-video-settings') updateAllVideos();
});

new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.addedNodes.length)) updateAllVideos();
}).observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('fullscreenchange', updateAllVideos);
document.addEventListener('webkitfullscreenchange', updateAllVideos);
updateAllVideos();
