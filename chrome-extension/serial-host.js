import {
  ARDUINO_BOOT_MS,
  HEARTBEAT_MS,
  createSerialManager
} from './serial-manager.js';

const serialManager = createSerialManager(navigator.serial);

let currentStatus = 'free';
let heartbeatTimer = null;
let connectPromise = null;
let lastHeartbeatAt = null;
let lastError = '';
let portsFound = 0;
let portInfo = null;

const statusEl = document.getElementById('host-status');
const portsEl = document.getElementById('host-ports');
const errorEl = document.getElementById('host-error');
const heartbeatEl = document.getElementById('host-heartbeat');

function renderDiagnostics() {
  if (statusEl) {
    statusEl.textContent = serialManager.isConnected() ? 'Conectado' : 'Desconectado';
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
}

async function syncStatusFromBackground() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (data?.status) {
      currentStatus = data.status;
    }
  } catch {
    // Ignorar.
  }
}

async function notifySerialStatus(connectionState, connected, extra = {}) {
  try {
    await chrome.runtime.sendMessage({
      type: 'SERIAL_STATUS',
      connectionState,
      connected,
      portsFound,
      error: lastError,
      lastHeartbeatAt,
      portInfo,
      ...extra
    });
  } catch {
    // Ignorar.
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!serialManager.isConnected()) {
      return;
    }
    sendLedState(currentStatus, 1).catch(() => {
      handleDisconnect();
    });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function handleDisconnect() {
  stopHeartbeat();
  await serialManager.closePort();
  lastHeartbeatAt = null;
  connectPromise = null;
  await notifySerialStatus('disconnected', false);
  renderDiagnostics();
}

async function sendLedState(status, retries = 3) {
  currentStatus = status;
  if (!serialManager.isConnected()) {
    return;
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await serialManager.writeCommand(status);
      lastHeartbeatAt = Date.now();
      renderDiagnostics();
      return;
    } catch (error) {
      if (attempt === retries - 1) {
        lastError = error.message;
        await handleDisconnect();
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

async function connectSerial() {
  if (serialManager.isConnected()) {
    return { ok: true, connected: true, portsFound };
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    await notifySerialStatus('connecting', false, { portsFound });

    const ports = await serialManager.getGrantedPorts();
    portsFound = ports.length;
    renderDiagnostics();

    if (ports.length === 0) {
      lastError = 'No hay puerto autorizado. Pulsa Conectar Arduino.';
      await notifySerialStatus('disconnected', false, { portsFound: 0 });
      return { ok: false, connected: false, portsFound: 0, error: lastError };
    }

    const result = await serialManager.connect({
      bootMs: ARDUINO_BOOT_MS,
      onDisconnect: () => {
        handleDisconnect();
      }
    });

    portsFound = result.portsFound ?? 0;
    portInfo = result.portInfo ?? null;

    if (!result.connected) {
      lastError = result.error || 'No se pudo conectar.';
      await notifySerialStatus('disconnected', false, { portsFound, portInfo });
      renderDiagnostics();
      return { ok: false, connected: false, portsFound, error: lastError };
    }

    lastError = '';
    await syncStatusFromBackground();
    await sendLedState(currentStatus, 5);
    startHeartbeat();
    await notifySerialStatus('connected', true, { portsFound, portInfo });
    renderDiagnostics();
    return { ok: true, connected: true, portsFound, portInfo };
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

chrome.runtime.sendMessage({ type: 'HOST_READY' }).catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({
      alive: true,
      connected: serialManager.isConnected(),
      portsFound
    });
    return true;
  }

  if (message.type === 'SERIAL_CONNECT' || message.type === 'AUTO_CONNECT') {
    connectSerial()
      .then((result) => sendResponse(result))
      .catch((error) => {
        lastError = error.message;
        renderDiagnostics();
        sendResponse({
          ok: false,
          connected: false,
          portsFound,
          error: error.message
        });
      });
    return true;
  }

  if (message.type === 'LED_STATE') {
    sendLedState(message.status)
      .then(() =>
        sendResponse({
          ok: true,
          connected: serialManager.isConnected(),
          portsFound
        })
      )
      .catch((error) =>
        sendResponse({ ok: false, connected: false, error: error.message })
      );
    return true;
  }

  if (message.type === 'MANUAL_LED') {
    if (!serialManager.isConnected()) {
      sendResponse({ ok: false, connected: false, error: 'Arduino no conectado.' });
      return true;
    }

    currentStatus = message.status;
    serialManager
      .writeCommand(message.status)
      .then(() => {
        lastHeartbeatAt = Date.now();
        renderDiagnostics();
        sendResponse({ ok: true, connected: true });
      })
      .catch((error) =>
        sendResponse({ ok: false, connected: false, error: error.message })
      );
    return true;
  }

  return false;
});

if ('serial' in navigator) {
  navigator.serial.addEventListener('connect', () => {
    connectSerial().catch(() => {});
  });
}

renderDiagnostics();
setInterval(renderDiagnostics, 2000);
