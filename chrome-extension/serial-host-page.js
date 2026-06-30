'use strict';

let currentStatus = 'free';
let lastHeartbeatAt = null;
let lastError = '';
let portsFound = 0;
let connected = false;

const statusEl = document.getElementById('host-status');
const portsEl = document.getElementById('host-ports');
const errorEl = document.getElementById('host-error');
const heartbeatEl = document.getElementById('host-heartbeat');
const setupPanel = document.getElementById('setup-panel');
const setupBtn = document.getElementById('setup-btn');
const setupStatus = document.getElementById('setup-status');
const introText = document.getElementById('intro-text');
const ledLampEl = document.getElementById('led-lamp');
const ledLabelEl = document.getElementById('led-label');

const wantsSetup = new URLSearchParams(window.location.search).get('setup') === '1';

function renderDiagnostics() {
  updateLedIndicator(ledLampEl, ledLabelEl, currentStatus, connected);

  if (statusEl) {
    statusEl.textContent = connected ? 'Conectado (host nativo)' : 'Desconectado';
  }
  if (portsEl) {
    portsEl.textContent = String(portsFound);
  }
  if (errorEl) {
    errorEl.textContent = lastError || '—';
  }
  if (heartbeatEl) {
    heartbeatEl.textContent = lastHeartbeatAt
      ? new Date(lastHeartbeatAt).toLocaleTimeString()
      : '—';
  }

  updateSetupPanel();
}

function updateSetupPanel() {
  if (!setupPanel || !setupBtn) {
    return;
  }

  if (connected) {
    setupPanel.classList.add('hidden');
    return;
  }

  setupPanel.classList.remove('hidden');

  const titleEl = setupPanel.querySelector('p');
  const stepsEl = setupPanel.querySelector('ol');

  if (portsFound > 0) {
    if (titleEl) {
      titleEl.innerHTML =
        '<strong>Puerto detectado:</strong> pulsa para conectar al Arduino por defecto.';
    }
    if (stepsEl) {
      stepsEl.style.display = 'none';
    }
    setupBtn.textContent = 'Conectar Arduino';
  } else {
    if (titleEl) {
      titleEl.innerHTML =
        '<strong>Sin puerto detectado:</strong> conecta tu Arduino por USB y vuelve a intentar.';
    }
    if (stepsEl) {
      stepsEl.style.display = '';
    }
    setupBtn.textContent = 'Reintentar detección';
  }
}

async function syncStatusFromBackground() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    currentStatus = data?.status || currentStatus;
    portsFound = Number(data?.portsFound ?? 0);
    connected = Boolean(data?.serialConnected);
    lastError = data?.lastError || '';
    lastHeartbeatAt = data?.lastHeartbeatAt ?? null;
  } catch (error) {
    lastError = error.message || 'No se pudo consultar el estado.';
  }
}

async function pinThisTab() {
  try {
    await chrome.runtime.sendMessage({ type: 'PIN_SERIAL_TAB' });
  } catch {
    /* ignore */
  }
}

async function connectNative() {
  setupBtn.disabled = true;
  setupStatus.textContent = 'Conectando al host nativo...';

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'RECONNECT',
      openSetupOnFailure: false
    });
    if (!result.connected) {
      throw new Error(result.error || 'No se pudo conectar al Arduino.');
    }

    await syncStatusFromBackground();
    setupStatus.textContent = '¡Conectado! La selección del puerto es automática.';
    if (introText) {
      introText.textContent =
        'Conectado por host nativo. Déjala fijada y en segundo plano.';
    }
    await pinThisTab();
    renderDiagnostics();
    return result;
  } catch (error) {
    lastError = error.message;
    setupStatus.textContent = error.message;
    renderDiagnostics();
    throw error;
  } finally {
    setupBtn.disabled = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ alive: true, connected, portsFound });
    return true;
  }
  return false;
});

if (setupBtn) {
  setupBtn.addEventListener('click', () => {
    connectNative().catch(() => {});
  });
}

chrome.runtime.sendMessage({ type: 'HOST_READY' }).catch(() => {});

(async function init() {
  await syncStatusFromBackground();

  if (wantsSetup && setupBtn && portsFound === 0) {
    setupStatus.textContent = 'Conecta tu Arduino por USB y pulsa el botón.';
  } else if (wantsSetup && setupBtn && portsFound > 0) {
    setupStatus.textContent = 'Pulsa el botón para conectar al Arduino por defecto.';
  }

  renderDiagnostics();
})();

setInterval(() => {
  syncStatusFromBackground().then(() => renderDiagnostics());
}, 3000);
