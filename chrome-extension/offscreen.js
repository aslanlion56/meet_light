'use strict';

const STATUS_COMMANDS = {
  free: 48,
  waiting: 49,
  active: 50
};

const ARDUINO_BOOT_MS = 2500;

let port = null;
let writer = null;
let currentStatus = null;

async function notifySerialStatus(connected) {
  try {
    await chrome.runtime.sendMessage({ type: 'SERIAL_STATUS', connected });
  } catch {
    // El service worker puede estar suspendido momentáneamente.
  }
}

async function writeCommand(status) {
  if (!writer) return false;

  const command = STATUS_COMMANDS[status] ?? STATUS_COMMANDS.free;
  await writer.write(new Uint8Array([command, 10]));
  return true;
}

async function sendLedState(status, retries = 3) {
  currentStatus = status;
  if (!writer) return;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await writeCommand(status);
      return;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function connectSerial(requestNewPort = false) {
  try {
    let serialPort;

    if (requestNewPort) {
      throw new Error('El puerto debe seleccionarse desde la pestaña de conexión.');
    }

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) {
      throw new Error('No hay puerto autorizado. Pulsa Conectar Arduino.');
    }

    serialPort = ports[0];

    if (port?.readable) {
      try {
        await port.close();
      } catch {
        // Ignorar errores al cerrar un puerto previo.
      }
    }

    port = serialPort;
    await port.open({ baudRate: 9600 });
    writer = port.writable.getWriter();

    port.addEventListener('disconnect', () => {
      port = null;
      writer = null;
      notifySerialStatus(false);
    });

    // El Arduino Uno se reinicia al abrir el puerto; esperar a que arranque.
    await new Promise((resolve) => setTimeout(resolve, ARDUINO_BOOT_MS));

    await notifySerialStatus(true);

    if (currentStatus !== null) {
      await sendLedState(currentStatus, 5);
    }
  } catch (error) {
    console.error('Error al conectar serial:', error);
    port = null;
    writer = null;
    await notifySerialStatus(false);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SERIAL_CONNECT') {
    connectSerial(Boolean(message.requestPort))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'LED_STATE') {
    sendLedState(message.status)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'RESYNC_LED') {
    if (currentStatus !== null) {
      sendLedState(currentStatus, 2)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    } else {
      sendResponse({ ok: true });
    }
    return true;
  }

  return false;
});

navigator.serial.getPorts().then((ports) => {
  if (ports.length > 0) {
    connectSerial(false).catch(() => {
      notifySerialStatus(false);
    });
  }
});
