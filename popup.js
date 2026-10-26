const extensionApi = globalThis.browser || globalThis.chrome;
const toggle = document.getElementById('toggleActive');
const modeInputs = document.querySelectorAll('input[name="mode"]');
const modeOptions = document.querySelectorAll('[data-mode]');
const activationStatus = document.getElementById('activationStatus');
const refresh = document.getElementById('refresh');
const status = document.getElementById('status');
const speedInput = document.getElementById('playbackSpeed');
const speedValue = document.getElementById('speedValue');
const speedTicks = document.querySelectorAll('[data-speed]');
const modeDescription = document.getElementById('modeDescription');
const modeNames = {
    original: 'Original', cover: 'Tela cheia', stretch: 'Estendida',
    width: 'Preencher largura', height: 'Preencher altura'
};
const modeDescriptions = {
    original: 'Mantém o formato do player',
    cover: 'Amplia e corta as bordas',
    stretch: 'Estica para ocupar o player',
    width: 'Ajusta às bordas laterais',
    height: 'Ajusta ao topo e à base'
};
const validModes = new Set(Object.keys(modeDescriptions));
const pipButton = document.getElementById('togglePip');
const pipLabel = document.getElementById('pipLabel');
const pipHint = document.getElementById('pipHint');
const emptyState = document.getElementById('emptyState');
const videoSettings = document.getElementById('videoSettings');
const checkVideo = document.getElementById('checkVideo');
let settingsReady = false;
let pageState = 'checking';
let pipTarget;
let pipActive = false;
let pipBusy = false;
let pipError = 'no-video';

const pipMessages = {
    'no-video': 'Abra um vídeo nesta aba para usar o vídeo flutuante.',
    'not-ready': 'Dê play no vídeo e clique em Verificar novamente.',
    'unsupported': 'Este navegador ou player não oferece vídeo flutuante. Os demais ajustes continuam disponíveis.',
    'blocked': 'O navegador ou este site bloqueou o vídeo flutuante.',
    'interaction-required': 'Clique em play ou pause no player e tente novamente.',
    'failed': 'Não foi possível abrir o vídeo flutuante neste player.',
    'unavailable': 'Abra uma página com vídeo e permita o acesso do Frameo a ela.'
};

const emptyMessages = {
    checking: ['Procurando seu vídeo…', 'Só um instante enquanto verificamos esta aba.'],
    empty: ['Abra um vídeo para começar', 'Abra um filme, uma série ou outro vídeo nesta aba. Dê play e volte ao Frameo para ajustar.'],
    'not-ready': ['Dê play para começar', 'Encontramos um player, mas o vídeo ainda não está pronto. Inicie a reprodução e verifique novamente.'],
    unavailable: ['Abra uma página com vídeo', 'O Frameo não conseguiu acessar esta aba. Abra um site com vídeo e confira se a extensão tem permissão para ele.']
};

function controlsEnabled() {
    return settingsReady && toggle.checked && pageState === 'ready';
}

function setControlTip(wrapperId, control, text) {
    const wrapper = document.getElementById(wrapperId);
    wrapper.dataset.tooltip = text;
    wrapper.tabIndex = control.disabled ? 0 : -1;
    wrapper.setAttribute('aria-label', text);
    control.setAttribute('aria-description', text);
}

function renderState() {
    const enabled = controlsEnabled();
    const inactive = !toggle.checked;
    const reason = !settingsReady ? 'Carregando suas preferências…'
        : inactive ? 'Ative o Frameo na chave acima para usar este controle.'
        : pageState === 'checking' ? 'Procurando um vídeo nesta aba…'
        : 'Abra um vídeo, dê play e verifique novamente.';

    activationStatus.textContent = inactive ? 'Desativado' : 'Ativado';
    document.getElementById('activationTip').dataset.tooltip = inactive ? 'Ativar o Frameo' : 'Desativar o Frameo';
    videoSettings.hidden = pageState !== 'ready';
    videoSettings.classList.toggle('is-disabled', !enabled);
    document.getElementById('modeFieldset').disabled = !enabled;
    modeInputs.forEach(input => {
        input.disabled = !enabled;
        input.setAttribute('aria-label', modeNames[input.value]);
        input.setAttribute('aria-description', enabled ? modeDescriptions[input.value] : reason);
    });
    modeOptions.forEach(option => {
        option.dataset.tooltip = enabled ? modeDescriptions[option.dataset.mode] : reason;
        option.tabIndex = enabled ? -1 : 0;
        option.setAttribute('aria-label', `${modeNames[option.dataset.mode]}. ${option.dataset.tooltip}`);
    });
    speedInput.disabled = !enabled;
    refresh.disabled = !enabled;
    pipButton.disabled = !enabled || !pipTarget || pipBusy;
    pipButton.setAttribute('aria-pressed', String(pipActive));
    pipLabel.textContent = pipActive ? 'Voltar para a aba' : 'Vídeo flutuante';
    setControlTip('speedTip', speedInput, enabled ? 'Ajusta a velocidade, inclusive no vídeo flutuante.' : reason);
    setControlTip('refreshTip', refresh, enabled ? 'Reaplicar o enquadramento e a velocidade ao vídeo.' : reason);
    setControlTip('pipTip', pipButton, !enabled ? reason : pipBusy ? 'Alternando o vídeo flutuante…'
        : !pipTarget ? pipMessages[pipError] || pipMessages.failed
        : pipActive ? 'Voltar o vídeo flutuante para esta aba.' : 'Assistir ao vídeo em uma janela sobre os outros apps.');

    emptyState.hidden = pageState === 'ready';
    emptyState.setAttribute('aria-busy', String(pageState === 'checking'));
    if (!emptyState.hidden) {
        const [title, description] = emptyMessages[pageState];
        document.getElementById('emptyTitle').textContent = title;
        document.getElementById('emptyDescription').textContent = description;
    }
    checkVideo.disabled = !settingsReady || inactive || pageState === 'checking';
    checkVideo.textContent = pageState === 'checking' ? 'Verificando…' : 'Verificar novamente';
    setControlTip('checkVideoTip', checkVideo, checkVideo.disabled ? reason : 'Verificar se um vídeo já está pronto nesta aba.');
    emptyState.classList.toggle('is-disabled', inactive);
    status.textContent = !settingsReady ? 'Carregando preferências…'
        : inactive ? 'Frameo desativado. Ative a chave para usar os controles.'
        : pageState === 'ready' ? 'As alterações são aplicadas automaticamente.'
        : 'Funciona nos vídeos da aba que você está usando.';
}

async function findPipTarget() {
    pageState = 'checking';
    pipTarget = undefined;
    pipHint.textContent = '';
    renderState();
    try {
        const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) throw new Error('Aba indisponível');
        const results = await extensionApi.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: controlPictureInPicture,
            args: ['inspect']
        });
        const candidate = selectPictureInPictureFrame(results);
        const hasVideo = results.some(entry => entry.result?.hasVideo || entry.result?.ok);
        const hasPlayer = results.some(entry => entry.result?.videoCount > 0 || entry.result?.error === 'not-ready');
        pageState = hasVideo ? 'ready' : hasPlayer ? 'not-ready' : 'empty';
        if (candidate) {
            pipTarget = { tabId: tab.id, frameIds: [candidate.frameId] };
            pipActive = candidate.result.active;
        } else {
            pipActive = false;
            const result = results.find(entry => entry.result?.error && entry.result.error !== 'no-video');
            pipError = result?.result.error || 'no-video';
        }
    } catch (error) {
        pageState = 'unavailable';
        pipError = 'unavailable';
        console.error('Não foi possível verificar os vídeos da aba:', error);
    }
    renderState();
}

pipButton.addEventListener('click', async () => {
    if (!controlsEnabled() || !pipTarget || pipBusy) return;
    pipBusy = true;
    renderState();
    try {
        const results = await extensionApi.scripting.executeScript({
            target: pipTarget, func: controlPictureInPicture, args: ['toggle']
        });
        const result = results[0]?.result;
        if (result?.ok) {
            pipActive = result.active;
            pipHint.textContent = '';
        } else pipHint.textContent = pipMessages[result?.error] || pipMessages.failed;
    } catch (error) {
        pipHint.textContent = 'A página mudou. Reabra o menu para tentar novamente.';
        console.error('Erro ao alternar PiP:', error);
    } finally {
        pipBusy = false;
        renderState();
    }
});

function normalizeSpeed(value) {
    return Number.isFinite(value) && value >= 0.5 && value <= 2 ? Math.round(value * 4) / 4 : 1;
}

function updateSpeedDisplay() {
    const speed = Number(speedInput.value);
    const label = speed.toLocaleString('pt-BR');
    speedValue.textContent = `${label}×`;
    speedInput.setAttribute('aria-valuetext', speed === 1 ? '1 vez, velocidade normal' : `${label} vezes`);
    speedInput.style.setProperty('--progress', `${(speed - 0.5) / 1.5 * 100}%`);
    speedTicks.forEach(tick => tick.classList.toggle('is-selected', Number(tick.dataset.speed) === speed));
}

async function loadSettings() {
    try {
        const data = await extensionApi.storage.local.get(['isActive', 'mode', 'playbackSpeed']);
        toggle.checked = data.isActive !== false;
        const mode = validModes.has(data.mode) ? data.mode : 'cover';
        modeInputs.forEach(input => { input.checked = input.value === mode; });
        modeDescription.textContent = modeDescriptions[mode];
        speedInput.value = normalizeSpeed(data.playbackSpeed);
        updateSpeedDisplay();
        settingsReady = true;
        toggle.disabled = false;
        renderState();
    } catch (error) {
        settingsReady = false;
        renderState();
        status.textContent = 'Não foi possível carregar as preferências. Reabra o menu.';
        console.error(error);
    }
}

toggle.addEventListener('change', async () => {
    if (!settingsReady) return;
    toggle.disabled = true;
    renderState();
    try {
        await extensionApi.storage.local.set({ isActive: toggle.checked });
    } catch (error) {
        await loadSettings();
        status.textContent = 'Não foi possível salvar a preferência.';
        console.error(error);
    } finally {
        toggle.disabled = false;
    }
});

modeInputs.forEach(input => input.addEventListener('change', async () => {
    if (!controlsEnabled() || !input.checked) return;
    modeDescription.textContent = modeDescriptions[input.value];
    try {
        await extensionApi.storage.local.set({ mode: input.value });
        status.textContent = 'Enquadramento atualizado.';
    } catch (error) {
        await loadSettings();
        status.textContent = 'Não foi possível salvar o enquadramento.';
        console.error(error);
    }
}));

speedInput.addEventListener('input', () => { if (controlsEnabled()) updateSpeedDisplay(); });
speedInput.addEventListener('change', async () => {
    if (!controlsEnabled()) return;
    updateSpeedDisplay();
    try {
        await extensionApi.storage.local.set({ playbackSpeed: Number(speedInput.value) });
        status.textContent = `Velocidade ajustada para ${speedValue.textContent}.`;
    } catch (error) {
        await loadSettings();
        status.textContent = 'Não foi possível salvar a velocidade.';
        console.error(error);
    }
});

refresh.addEventListener('click', async () => {
    if (!controlsEnabled()) return;
    try {
        const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) throw new Error('Aba indisponível');
        await extensionApi.tabs.sendMessage(tab.id, { type: 'reapply-video-settings' });
        status.textContent = 'Ajuste reaplicado.';
    } catch (error) {
        status.textContent = 'Recarregue a página com o vídeo e tente novamente.';
        console.error(error);
    }
});

checkVideo.addEventListener('click', () => {
    if (settingsReady && toggle.checked && pageState !== 'checking') return findPipTarget();
});

loadSettings();
findPipTarget();
