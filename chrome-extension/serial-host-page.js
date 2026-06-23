'use strict';

const STATUS_COMMANDS = { free: 48, waiting: 49, active: 50 };
const ARDUINO_BOOT_MS = 2500;
const HEARTBEAT_MS = 1000;

let port = null;
let writer = null;
let reader = null;
let readLoopActive = false;
let isConnecting = false;
let connectPromise = null;
let currentStatus = 'free';
let heartbeatTimer = null;
let lastHeartbeatAt = null;
let lastError = '';
let portsFound = 0;

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

function isConnected() {
  return Boolean(writer && port);
}

function renderDiagnostics() {
  updateLedIndicator(ledLampEl, ledLabelEl, currentStatus, isConnected());

  if (statusEl) {
    statusEl.textContent = isConnected() ? 'Conectado' : 'Desconectado';
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

  if (isConnected()) {
    setupPanel.classList.add('hidden');
    return;
  }

  setupPanel.classList.remove('hidden');

  const titleEl = setupPanel.querySelector('p');
  const stepsEl = setupPanel.querySelector('ol');

  if (portsFound > 0) {
    if (titleEl) {
      titleEl.innerHTML =
        '<strong>Desconectado:</strong> el puerto USB ya está autorizado. Pulsa para conectar.';
    }
    if (stepsEl) {
      stepsEl.style.display = 'none';
    }
    setupBtn.textContent = 'Conectar al puerto autorizado';
  } else {
    if (titleEl) {
      titleEl.innerHTML = '<strong>Primera conexión:</strong> elige el puerto USB desde aquí.';
    }
    if (stepsEl) {
      stepsEl.style.display = '';
    }
    setupBtn.textContent = 'Elegir puerto USB';
  }
}

function buildCommandBytes(status) {
  const command = STATUS_COMMANDS[status] ?? STATUS_COMMANDS.free;
  return new Uint8Array([command, 10]);
}

async function closePort() {
  readLoopActive = false;
  if (reader) {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
    reader = null;
  }
  if (writer) {
    try {
      await writer.close();
    } catch {
      /* ignore */
    }
    try {
      writer.releaseLock();
    } catch {
      /* ignore */
    }
    writer = null;
  }
  if (port) {
    try {
      await port.close();
    } catch {
      /* ignore */
    }
    port = null;
  }
}

function startInputDrain() {
  if (!port?.readable || reader) {
    return;
  }
  reader = port.readable.getReader();
  readLoopActive = true;
  (async () => {
    try {
      while (readLoopActive && port) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      /* ignore */
    } finally {
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
        reader = null;
      }
      readLoopActive = false;
    }
  })();
}

async function refreshPortCount() {
  if (!('serial' in navigator)) {
    portsFound = 0;
    return 0;
  }
  const ports = await navigator.serial.getPorts();
  portsFound = ports.length;
  renderDiagnostics();
  return portsFound;
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
      ...extra
    });
  } catch {
    /* ignore */
  }
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!isConnected()) {
      return;
    }
    sendLedState(currentStatus, 1).catch(() => handleDisconnect());
  }, HEARTBEAT_MS);
}

async function handleDisconnect() {
  stopHeartbeat();
  await closePort();
  lastHeartbeatAt = null;
  connectPromise = null;
  await refreshPortCount();
  await notifySerialStatus('disconnected', false);
  renderDiagnostics();
}

async function sendLedState(status, retries = 3) {
  currentStatus = status;
  if (!isConnected()) {
    return;
  }
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await writer.write(buildCommandBytes(status));
      lastHeartbeatAt = Date.now();
      renderDiagnostics();
      return;
    } catch (error) {
      if (attempt === retries - 1) {
        lastError = error.message;
        await handleDisconnect();
        throw error;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

async function syncStatusFromBackground() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (data?.status) {
      currentStatus = data.status;
    }
  } catch {
    /* ignore */
  }
}

async function pinThisTab() {
  try {
    await chrome.runtime.sendMessage({ type: 'PIN_SERIAL_TAB' });
  } catch {
    /* ignore */
  }
}

async function connectSerial() {
  if (isConnected()) {
    await notifySerialStatus('connected', true, { portsFound });
    renderDiagnostics();
    return { ok: true, connected: true, portsFound };
  }
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    if (isConnecting) {
      return { ok: false, connected: false, error: 'Conexión en progreso.' };
    }
    isConnecting = true;

    try {
      await notifySerialStatus('connecting', false, { portsFound });
      await refreshPortCount();

      if (portsFound === 0) {
        lastError = 'Pulsa "Elegir puerto USB" en esta pestaña.';
        await notifySerialStatus('disconnected', false, { portsFound: 0 });
        return { ok: false, connected: false, portsFound: 0, error: lastError };
      }

      await closePort();
      const ports = await navigator.serial.getPorts();
      const serialPort = ports[0];
      try {
        await serialPort.close();
      } catch {
        /* ignore */
      }

      port = serialPort;
      await port.open({ baudRate: 9600 });
      writer = port.writable.getWriter();
      startInputDrain();
      port.addEventListener('disconnect', () => {
        handleDisconnect();
      });

      await new Promise((r) => setTimeout(r, ARDUINO_BOOT_MS));

      lastError = '';
      await syncStatusFromBackground();
      await sendLedState(currentStatus, 5);
      startHeartbeat();
      await chrome.storage.local.set({ portWasAuthorized: true });
      await notifySerialStatus('connected', true, { portsFound });
      await pinThisTab();
      renderDiagnostics();
      return { ok: true, connected: true, portsFound };
    } catch (error) {
      lastError = error.message;
      await closePort();
      await notifySerialStatus('disconnected', false, { portsFound, error: lastError });
      renderDiagnostics();
      return { ok: false, connected: false, portsFound, error: lastError };
    } finally {
      isConnecting = false;
    }
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function requestPortAndConnect() {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial no está disponible en este navegador.');
  }

  setupBtn.disabled = true;
  setupStatus.textContent = 'Selecciona el puerto USB del Arduino...';

  try {
    await navigator.serial.requestPort();
    setupStatus.textContent = 'Puerto autorizado. Conectando...';

    const count = await refreshPortCount();
    if (count === 0) {
      throw new Error('Chrome no guardó el permiso. Pulsa de nuevo.');
    }

    const result = await connectSerial();
    if (!result.connected) {
      throw new Error(result.error || 'No se pudo conectar.');
    }

    setupStatus.textContent = '¡Conectado! Puedes fijar esta pestaña y dejarla en segundo plano.';
    if (introText) {
      introText.textContent = 'Conectado. Déjala fijada y en segundo plano.';
    }
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
    sendResponse({ alive: true, connected: isConnected(), portsFound });
    return true;
  }

  if (message.type === 'REQUEST_PORT_CONNECT') {
    requestPortAndConnect()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, connected: false, error: error.message })
      );
    return true;
  }

  if (message.type === 'SERIAL_CONNECT' || message.type === 'AUTO_CONNECT') {
    connectSerial()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ ok: false, connected: false, error: error.message })
      );
    return true;
  }

  if (message.type === 'LED_STATE') {
    sendLedState(message.status)
      .then(() => sendResponse({ ok: true, connected: isConnected() }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'MANUAL_LED') {
    if (!isConnected()) {
      sendResponse({ ok: false, error: 'Arduino no conectado.' });
      return true;
    }
    currentStatus = message.status;
    writer
      .write(buildCommandBytes(message.status))
      .then(() => {
        lastHeartbeatAt = Date.now();
        renderDiagnostics();
        sendResponse({ ok: true, connected: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

if (setupBtn) {
  setupBtn.addEventListener('click', () => {
    if (portsFound > 0) {
      connectSerial().catch(() => {});
      return;
    }

    requestPortAndConnect().catch(() => {});
  });
}

chrome.runtime.sendMessage({ type: 'HOST_READY' }).catch(() => {});

(async function init() {
  await refreshPortCount();
  await syncStatusFromBackground();

  if (!isConnected()) {
    await notifySerialStatus('disconnected', false);
  }

  if (wantsSetup && setupBtn && portsFound === 0) {
    setupStatus.textContent = 'Pulsa el botón para elegir el puerto USB.';
  } else if (wantsSetup && setupBtn && portsFound > 0) {
    setupStatus.textContent = 'Pulsa el botón para conectar al puerto autorizado.';
  }

  renderDiagnostics();
})();

setInterval(() => {
  refreshPortCount().catch(() => {});
}, 3000);
