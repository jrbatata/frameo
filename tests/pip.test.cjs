const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/../pip.js`, 'utf8');

function fixture(options = {}) {
    const videos = [];
    const document = {
        pictureInPictureEnabled: options.standard !== false,
        pictureInPictureElement: null,
        querySelectorAll: selector => selector === 'video' ? videos : [],
        async exitPictureInPicture() {
            const video = this.pictureInPictureElement;
            this.pictureInPictureElement = null;
            video?.emit('leavepictureinpicture');
        }
    };
    const context = vm.createContext({ document, getComputedStyle: video => video.css, setTimeout, clearTimeout });
    vm.runInContext(source, context);
    function video(properties = {}) {
        const attributes = new Map();
        const events = new Map();
        const element = {
            paused: false, ended: false, readyState: 4, videoWidth: 1920,
            width: 640, height: 360, opens: 0,
            css: { display: 'block', visibility: 'visible', opacity: '1' },
            getBoundingClientRect() { return { width: this.width, height: this.height }; },
            getRootNode: () => document,
            hasAttribute: name => attributes.has(name),
            getAttribute: name => attributes.get(name),
            setAttribute: (name, value) => attributes.set(name, value),
            removeAttribute: name => attributes.delete(name),
            addEventListener(name, listener) {
                if (!events.has(name)) events.set(name, new Set());
                events.get(name).add(listener);
            },
            removeEventListener: (name, listener) => events.get(name)?.delete(listener),
            emit: name => [...(events.get(name) || [])].forEach(listener => listener()),
            async requestPictureInPicture() {
                assert(!attributes.has('disablepictureinpicture'));
                this.opens++;
                document.pictureInPictureElement = this;
            },
            ...properties
        };
        videos.push(element);
        return element;
    }
    return { document, context, video, run: action => context.controlPictureInPicture(action) };
}

test('inspection is read-only and selects playing visible video over a larger paused video', async () => {
    const f = fixture();
    const paused = f.video({ paused: true, width: 1900, height: 1000 });
    const playing = f.video();
    const hidden = f.video({ width: 3000, css: { display: 'none', visibility: 'visible', opacity: '1' } });
    const result = await f.run('inspect');
    assert(result.ok);
    assert.equal(playing.opens, 0);
    assert((await f.run('toggle')).active);
    assert.equal(playing.opens, 1);
    assert.equal(paused.opens + hidden.opens, 0);
});

test('active PiP takes priority, including a now hidden video; next click exits', async () => {
    const f = fixture();
    const active = f.video({ width: 0, height: 0 });
    f.document.pictureInPictureElement = active;
    f.video();
    assert.equal((await f.run('inspect')).active, true);
    assert.equal((await f.run('toggle')).active, false);
    assert.equal(f.document.pictureInPictureElement, null);
});

test('Safari presentation API opens and exits the same video', async () => {
    const f = fixture({ standard: false });
    const video = f.video({
        requestPictureInPicture: undefined,
        webkitPresentationMode: 'inline',
        webkitSupportsPresentationMode: () => true,
        webkitSetPresentationMode(mode) { this.webkitPresentationMode = mode; }
    });
    assert.equal((await f.run('toggle')).active, true);
    assert.equal(video.webkitPresentationMode, 'picture-in-picture');
    assert.equal((await f.run('toggle')).active, false);
    assert.equal(video.webkitPresentationMode, 'inline');
});

test('Safari silent refusal is reported instead of claiming success', async () => {
    const f = fixture({ standard: false });
    f.video({
        webkitPresentationMode: 'inline',
        webkitSupportsPresentationMode: () => true,
        webkitSetPresentationMode() {}
    });
    assert.equal((await f.run('toggle')).error, 'interaction-required');
});

test('temporarily removes the site hint and restores its exact value on exit', async () => {
    const f = fixture();
    const video = f.video();
    video.setAttribute('disablepictureinpicture', 'true');
    assert.equal((await f.run('toggle')).active, true);
    assert(!video.hasAttribute('disablepictureinpicture'));
    await f.document.exitPictureInPicture();
    assert.equal(video.getAttribute('disablepictureinpicture'), 'true');
});

test('gesture rejection is reported and site hint is restored', async () => {
    const f = fixture();
    const video = f.video({ requestPictureInPicture: async () => { throw { name: 'NotAllowedError' }; } });
    video.setAttribute('disablepictureinpicture', '');
    assert.equal((await f.run('toggle')).error, 'interaction-required');
    assert.equal(video.getAttribute('disablepictureinpicture'), '');
});

test('permissions policy is respected and metadata / missing video failures are distinct', async () => {
    const blocked = fixture({ standard: false });
    const video = blocked.video();
    assert.equal((await blocked.run('toggle')).error, 'blocked');
    assert.equal((await blocked.run('inspect')).hasVideo, true);
    assert.equal(video.opens, 0);
    const empty = fixture();
    assert.equal((await empty.run('inspect')).error, 'no-video');
    empty.video({ readyState: 0, videoWidth: 0 });
    assert.equal((await empty.run('inspect')).error, 'not-ready');
    const unsupported = fixture({ standard: false });
    unsupported.video({ requestPictureInPicture: undefined });
    assert.equal((await unsupported.run('inspect')).error, 'unsupported');
});

test('finds videos inside an open shadow root', async () => {
    const f = fixture();
    const video = f.video();
    const shadowRoot = { querySelectorAll: selector => selector === 'video' ? [video] : [], pictureInPictureElement: null };
    f.document.querySelectorAll = selector => selector === '*' ? [{ shadowRoot }] : [];
    video.getRootNode = () => shadowRoot;
    video.requestPictureInPicture = async () => { shadowRoot.pictureInPictureElement = video; };
    assert.equal((await f.run('toggle')).active, true);
});

test('selects exactly one frame, prioritizing an existing PiP then playback and area', () => {
    const { context } = fixture();
    const frames = [
        { frameId: 0, result: { ok: false, error: 'no-video' } },
        { frameId: 4, result: { ok: true, score: 1000000100000 } },
        { frameId: 7, result: { ok: true, score: 3000000000000, active: true } }
    ];
    assert.equal(context.selectPictureInPictureFrame(frames).frameId, 7);
    assert.equal(context.selectPictureInPictureFrame(frames.slice(0, 2)).frameId, 4);
    assert.equal(context.selectPictureInPictureFrame([]), undefined);
});

test('popup discovers across frames but toggles only the selected frame and updates the label', async () => {
    const nodes = {};
    const node = () => ({
        textContent: '', value: 1, checked: false, disabled: true,
        handlers: {}, attributes: {}, dataset: {}, classList: { toggle() {} }, style: { setProperty() {} },
        addEventListener(name, listener) { this.handlers[name] = listener; },
        setAttribute(name, value) { this.attributes[name] = value; }
    });
    const calls = [];
    let floating = false;
    const context = vm.createContext({
        console,
        document: { getElementById: id => nodes[id] ||= node(), querySelectorAll: () => [] },
        browser: {
            storage: { local: { get: async () => ({}) } },
            tabs: { query: async () => [{ id: 42 }] },
            scripting: { executeScript: async injection => {
                calls.push(injection);
                if (injection.args[0] === 'inspect') return [
                    { frameId: 0, result: { ok: false, error: 'no-video' } },
                    { frameId: 6, result: { ok: true, active: false, score: 1000000100000 } }
                ];
                floating = !floating;
                return [{ frameId: 6, result: { ok: true, active: floating } }];
            } }
        }
    });
    vm.runInContext(source, context);
    vm.runInContext(fs.readFileSync(`${__dirname}/../popup.js`, 'utf8'), context);
    await new Promise(setImmediate);
    assert.equal(calls[0].target.allFrames, true);
    assert.equal(nodes.togglePip.disabled, false);
    await nodes.togglePip.handlers.click();
    assert.equal(calls[1].target.tabId, 42);
    assert.deepEqual(Array.from(calls[1].target.frameIds), [6]);
    assert.equal(calls[1].target.allFrames, undefined);
    assert.equal(nodes.pipLabel.textContent, 'Voltar para a aba');
    assert.equal(nodes.togglePip.attributes['aria-pressed'], 'true');
    await nodes.togglePip.handlers.click();
    assert.equal(nodes.pipLabel.textContent, 'Vídeo flutuante');
    assert.equal(nodes.togglePip.attributes['aria-pressed'], 'false');
});
