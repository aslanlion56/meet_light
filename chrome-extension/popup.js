'use strict';

const meetingStatusEl = document.getElementById('meeting-status');
const serialStatusEl = document.getElementById('serial-status');
const connectBtn = document.getElementById('connect-btn');
const errorMsgEl = document.getElementById('error-msg');
const btnGreen = document.getElementById('btn-green');
const btnBlue = document.getElementById('btn-blue');
const btnRed = document.getElementById('btn-red');
const btnRestore = document.getElementById('btn-restore');

let serialConnected = false;

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

function renderSerialStatus(connected) {
  serialConnected = connected;
  serialStatusEl.innerHTML = connected
    ? '<span class="dot green"></span>Conectado'
    : '<span class="dot disconnected"></span>Desconectado';
  setManualButtonsEnabled(connected);
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  renderMeetingStatus(status.status || 'free', status.platform);
  renderSerialStatus(Boolean(status.serialConnected));
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

connectBtn.addEventListener('click', () => {
  showError('');
  chrome.tabs.create({ url: chrome.runtime.getURL('connect.html') });
});

btnGreen.addEventListener('click', () => sendManualColor('free'));
btnBlue.addEventListener('click', () => sendManualColor('waiting'));
btnRed.addEventListener('click', () => sendManualColor('active'));
btnRestore.addEventListener('click', restoreState);

refreshStatus();
setInterval(refreshStatus, 2000);
