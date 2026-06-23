'use strict';

const meetingStatusEl = document.getElementById('meeting-status');
const serialStatusEl = document.getElementById('serial-status');
const connectBtn = document.getElementById('connect-btn');
const reconnectBtn = document.getElementById('reconnect-btn');
const errorMsgEl = document.getElementById('error-msg');
const portsFoundEl = document.getElementById('ports-found');
const lastErrorEl = document.getElementById('last-error');
const btnGreen = document.getElementById('btn-green');
const btnBlue = document.getElementById('btn-blue');
const btnRed = document.getElementById('btn-red');
const btnRestore = document.getElementById('btn-restore');
const ledLampEl = document.getElementById('led-lamp');
const ledLabelEl = document.getElementById('led-label');

let serialConnected = false;
let meetingStatus = 'free';
let portsFound = 0;

function showError(message) {
  if (!message) {
    errorMsgEl.textContent = '';
    errorMsgEl.classList.remove('visible');
    return;
  }

  errorMsgEl.textContent = message;
  errorMsgEl.classList.add('visible');
}

function setManualButtonsEnabled(enabled) {
  btnGreen.disabled = !enabled;
  btnBlue.disabled = !enabled;
  btnRed.disabled = !enabled;
  btnRestore.disabled = !enabled;
}

function renderLedPreview(status, connected) {
  meetingStatus = status || 'free';
  updateLedIndicator(ledLampEl, ledLabelEl, meetingStatus, connected);
}

function renderMeetingStatus(status, platform) {
  if (status === 'active') {
    if (platform === 'meet') {
      meetingStatusEl.textContent = 'En junta (Meet)';
      return;
    }

    if (platform === 'teams') {
      meetingStatusEl.textContent = 'En junta (Teams)';
      return;
    }

    meetingStatusEl.textContent = 'En junta';
    return;
  }

  if (status === 'waiting') {
    if (platform === 'meet') {
      meetingStatusEl.textContent = 'Meet abierto';
      return;
    }

    if (platform === 'teams') {
      meetingStatusEl.textContent = 'Teams abierto';
      return;
    }

    meetingStatusEl.textContent = 'Página abierta';
    return;
  }

  meetingStatusEl.textContent = 'Libre';
}

function renderSerialStatus(connectionState, connected) {
  serialConnected = connected;

  if (connectionState === 'connecting') {
    serialStatusEl.innerHTML = '<span class="dot connecting"></span>Reconectando...';
    connectBtn.textContent = 'Reconectando...';
    connectBtn.disabled = true;
    reconnectBtn.disabled = true;
    setManualButtonsEnabled(false);
    return;
  }

  connectBtn.disabled = false;
  reconnectBtn.disabled = false;

  if (connected) {
    serialStatusEl.innerHTML = '<span class="dot green"></span>Conectado';
    connectBtn.textContent = 'Reconectar Arduino';
    setManualButtonsEnabled(true);
    return;
  }

  serialStatusEl.innerHTML = '<span class="dot disconnected"></span>Desconectado';
  connectBtn.textContent = 'Conectar Arduino';
  setManualButtonsEnabled(false);
}

function renderDiagnostics(status) {
  portsFound = Number(status.portsFound ?? 0);
  portsFoundEl.textContent = portsFound > 0 ? String(portsFound) : '0';
  lastErrorEl.textContent = status.lastError || '—';
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  const connected = Boolean(status.serialConnected);
  const meeting = status.status || 'free';

  renderMeetingStatus(meeting, status.platform);
  renderSerialStatus(
    status.serialConnectionState || (connected ? 'connected' : 'disconnected'),
    connected
  );
  renderLedPreview(meeting, connected);
  renderDiagnostics(status);
}

async function sendManualColor(status) {
  showError('');

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'MANUAL_LED',
      status
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'No se pudo enviar el comando al Arduino.');
    }
  } catch (error) {
    showError(error.message || 'Error al cambiar el LED.');
    console.error(error);
  }
}

async function restoreState() {
  showError('');

  try {
    const result = await chrome.runtime.sendMessage({ type: 'RESTORE_LED' });

    if (!result?.ok) {
      throw new Error(result?.error || 'No se pudo restaurar el estado.');
    }
  } catch (error) {
    showError(error.message || 'Error al restaurar.');
    console.error(error);
  }
}

async function reconnectNow() {
  showError('');
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = 'Reconectando...';
  renderSerialStatus('connecting', false);
  renderLedPreview(meetingStatus, false);

  try {
    if (portsFound === 0) {
      await chrome.runtime.sendMessage({ type: 'OPEN_SERIAL_SETUP' });
      return;
    }

    const result = await chrome.runtime.sendMessage({ type: 'RECONNECT_NOW' });

    if (result?.skipped && result?.reason === 'already_connected') {
      return;
    }

    if (!result?.connected) {
      throw new Error(result?.error || 'No se pudo reconectar. Abre la pestaña serial.');
    }
  } catch (error) {
    showError(error.message || 'Error al reconectar.');
    console.error(error);
  } finally {
    reconnectBtn.disabled = false;
    reconnectBtn.textContent = 'Reconectar ahora';
    refreshStatus();
  }
}

connectBtn.addEventListener('click', async () => {
  showError('');
  try {
    if (portsFound > 0 && !serialConnected) {
      await reconnectNow();
      return;
    }

    await chrome.runtime.sendMessage({ type: 'OPEN_SERIAL_SETUP' });
    refreshStatus();
  } catch (error) {
    showError('No se pudo abrir la pestaña serial.');
    console.error(error);
  }
});

reconnectBtn.addEventListener('click', reconnectNow);
btnGreen.addEventListener('click', () => sendManualColor('free'));
btnBlue.addEventListener('click', () => sendManualColor('waiting'));
btnRed.addEventListener('click', () => sendManualColor('active'));
btnRestore.addEventListener('click', restoreState);

refreshStatus();
setInterval(refreshStatus, 1000);
