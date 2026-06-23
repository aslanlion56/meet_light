'use strict';

const meetingStatusEl = document.getElementById('meeting-status');
const serialStatusEl = document.getElementById('serial-status');
const connectBtn = document.getElementById('connect-btn');
const errorMsgEl = document.getElementById('error-msg');

function showError(message) {
  if (!message) {
    errorMsgEl.textContent = '';
    errorMsgEl.classList.remove('visible');
    return;
  }

  errorMsgEl.textContent = message;
  errorMsgEl.classList.add('visible');
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
  serialStatusEl.innerHTML = connected
    ? '<span class="dot green"></span>Conectado'
    : '<span class="dot disconnected"></span>Desconectado';
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  renderMeetingStatus(status.status || 'free', status.platform);
  renderSerialStatus(Boolean(status.serialConnected));
}

connectBtn.addEventListener('click', () => {
  showError('');
  chrome.tabs.create({ url: chrome.runtime.getURL('connect.html') });
});

refreshStatus();
setInterval(refreshStatus, 2000);
