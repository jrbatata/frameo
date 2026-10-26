const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const wait = () => new Promise(setImmediate);
const ready = [{ frameId: 3, result: { ok: true, hasVideo: true, active: false, score: 100 } }];

function fixture({ settings = {}, frames = ready, inspection } = {}) {
    const nodes = {};
    const writes = [], injections = [], messages = [];
    function node(value) {
        const classes = new Set();
        return {
            value, checked: true, hidden: false, disabled: false, textContent: '', dataset: {}, attributes: {}, handlers: {},
            style: { setProperty() {} },
            classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(event, handler) { this.handlers[event] = handler; }
        };
    }
    const modes = ['original', 'cover', 'stretch', 'width', 'height'].map(node);
    const options = modes.map(input => Object.assign(node(), { dataset: { mode: input.value } }));
    let result = frames;
    const context = vm.createContext({
        console: { error() {} },
        document: {
            getElementById: id => nodes[id] ||= node(),
            querySelectorAll: selector => selector === 'input[name="mode"]' ? modes : selector === '[data-mode]' ? options : []
        },
        browser: {
            storage: { local: { get: async () => settings, set: async patch => { writes.push(patch); Object.assign(settings, patch); } } },
            tabs: { query: async () => [{ id: 42 }], sendMessage: async (...args) => messages.push(args) },
            scripting: { executeScript: async injection => {
                injections.push(injection);
                if (injection.args[0] === 'inspect') return inspection ? inspection() : result;
                return [{ frameId: 3, result: { ok: true, active: true } }];
            } }
        }
    });
    for (const file of ['pip.js', 'popup.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    return { nodes, modes, options, writes, injections, messages, setFrames: frames => { result = frames; } };
}

test('disabled extension dims and blocks every action without overwriting saved preferences', async () => {
    const f = fixture({ settings: { isActive: false, mode: 'height', playbackSpeed: 1.75 } });
    await wait();
    assert(f.nodes.videoSettings.classList.contains('is-disabled'));
    assert.equal(f.nodes.videoSettings.hidden, false);
    assert(f.modes.every(input => input.disabled));
    for (const id of ['playbackSpeed', 'refresh', 'togglePip', 'checkVideo']) assert(f.nodes[id].disabled, id);
    assert.equal(f.nodes.toggleActive.disabled, false);
    assert.match(f.nodes.pipTip.dataset.tooltip, /Ative o Frameo/);
    assert.match(f.nodes.speedTip.dataset.tooltip, /Ative o Frameo/);
    assert(f.modes.find(input => input.value === 'height').checked);
    assert.equal(f.nodes.playbackSpeed.value, 1.75);
    // Handlers are guarded as well as the native HTML controls.
    await f.nodes.togglePip.handlers.click();
    await f.nodes.refresh.handlers.click();
    await f.nodes.playbackSpeed.handlers.change();
    await f.modes[0].handlers.change();
    await f.nodes.checkVideo.handlers.click();
    assert.equal(f.writes.length, 0);
    assert.equal(f.messages.length, 0);
    assert.equal(f.injections.length, 1);
    f.nodes.toggleActive.checked = true;
    await f.nodes.toggleActive.handlers.change();
    assert.equal(f.nodes.togglePip.disabled, false);
    assert.equal(f.nodes.playbackSpeed.disabled, false);
    assert.equal(f.nodes.playbackSpeed.value, 1.75);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].isActive, true);
});

test('empty state explains usage and retry reveals controls once a video is ready', async () => {
    const f = fixture({ frames: [{ frameId: 0, result: { ok: false, error: 'no-video', hasVideo: false, videoCount: 0 } }] });
    await wait();
    assert.equal(f.nodes.emptyState.hidden, false);
    assert.equal(f.nodes.videoSettings.hidden, true);
    assert.match(f.nodes.emptyDescription.textContent, /Dê play/);
    assert.equal(f.nodes.togglePip.disabled, true);
    assert.equal(f.nodes.checkVideo.disabled, false);
    f.setFrames(ready);
    await f.nodes.checkVideo.handlers.click();
    assert.equal(f.nodes.emptyState.hidden, true);
    assert.equal(f.nodes.videoSettings.hidden, false);
    assert.equal(f.nodes.playbackSpeed.disabled, false);
});

test('PiP unavailable does not hide or disable framing and speed for a usable video', async () => {
    const f = fixture({ frames: [{ frameId: 0, result: { ok: false, error: 'blocked', hasVideo: true, videoCount: 1 } }] });
    await wait();
    assert.equal(f.nodes.emptyState.hidden, true);
    assert.equal(f.nodes.togglePip.disabled, true);
    assert.equal(f.nodes.playbackSpeed.disabled, false);
    assert(f.modes.every(input => !input.disabled));
    assert.match(f.nodes.pipTip.dataset.tooltip, /bloqueou/);
});

test('not-ready player and inaccessible page have actionable, distinct empty states', async () => {
    const f = fixture({ frames: [{ frameId: 0, result: { ok: false, error: 'not-ready', hasVideo: false, videoCount: 1 } }] });
    await wait();
    assert.equal(f.nodes.emptyTitle.textContent, 'Dê play para começar');
    const inaccessible = fixture({ inspection: async () => { throw new Error('No host permission'); } });
    await wait();
    assert.equal(inaccessible.nodes.videoSettings.hidden, true);
    assert.match(inaccessible.nodes.emptyDescription.textContent, /permissão/);
});

test('late detection cannot re-enable controls after the user switches off', async () => {
    let resolve;
    const f = fixture({ inspection: () => new Promise(done => { resolve = done; }) });
    await wait();
    f.nodes.toggleActive.checked = false;
    await f.nodes.toggleActive.handlers.change();
    resolve(ready);
    await wait();
    assert.equal(f.nodes.togglePip.disabled, true);
    assert.equal(f.nodes.playbackSpeed.disabled, true);
    assert(f.nodes.videoSettings.classList.contains('is-disabled'));
});
