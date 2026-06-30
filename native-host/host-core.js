'use strict';

const {
  validateStatus,
  validateBaudRate,
  validatePortPath,
  sanitizeError,
  sanitizePortInfo,
  sanitizePortList
} = require('./protocol');

const COMMANDS = { free: 48, waiting: 49, active: 50 };
const DEFAULT_BAUD_RATE = 9600;
const HEARTBEAT_MS = 1000;
const KNOWN_VENDOR_IDS = new Set(['2341', '2a03', '1a86', '10c4', '0403', '16c0']);

function normalizePathName(pathName = '') {
  return String(pathName).toLowerCase();
}

function matchesArduinoPort(candidate) {
  const vendorId = String(candidate.vendorId || '').toLowerCase();
  const pathName = normalizePathName(candidate.path);
  if (KNOWN_VENDOR_IDS.has(vendorId)) {
    return true;
  }
  return (
    pathName.includes('usbmodem') ||
    pathName.includes('usbserial') ||
    pathName.includes('ttyusb') ||
    pathName.includes('ttyacm') ||
    /^com\d+$/i.test(pathName)
  );
}

function isIgnoredPort(candidate) {
  const pathName = normalizePathName(candidate.path);
  return (
    pathName.includes('bluetooth') ||
    pathName.includes('incoming-port') ||
    pathName.includes('huawei') ||
    pathName === '/dev/tty.urt0' ||
    pathName === '/dev/cu.urt0'
  );
}

function portPriority(candidate) {
  const pathName = normalizePathName(candidate.path);
  let score = 0;
  if (matchesArduinoPort(candidate)) score += 100;
  if (pathName.includes('usbserial') || pathName.includes('usbmodem')) score += 50;
  if (pathName.startsWith('/dev/cu.')) score += 20;
  if (pathName.startsWith('/dev/tty.')) score += 10;
  if (isIgnoredPort(candidate)) score -= 200;
  return score;
}

function buildCommand(status) {
  const safeStatus = validateStatus(status);
  return Buffer.from([COMMANDS[safeStatus], 10]);
}

function createHostCore(deps) {
  const {
    SerialPort,
    readPreference,
    writePreference,
    now = () => Date.now(),
    bootDelayMs = 2500
  } = deps;

  let port = null;
  let portInfo = null;
  let lastError = '';
  let lastHeartbeatAt = null;
  let lastStatus = 'free';
  let heartbeatTimer = null;

  async function listPorts() {
    const ports = await SerialPort.list();
    return ports.filter((candidate) => !isIgnoredPort(candidate));
  }

  async function pickDefaultPort(requestedPath) {
    const ports = await listPorts();
    if (ports.length === 0) {
      return { selected: null, ports };
    }

    const preferredPath = requestedPath || readPreference();
    if (preferredPath) {
      const preferred = ports.find((item) => item.path === preferredPath);
      if (preferred) {
        return { selected: preferred, ports };
      }
      const preferredCu = preferredPath.replace('/dev/tty.', '/dev/cu.');
      const preferredTty = preferredPath.replace('/dev/cu.', '/dev/tty.');
      const alternate = ports.find(
        (item) => item.path === preferredCu || item.path === preferredTty
      );
      if (alternate) {
        return { selected: alternate, ports };
      }
    }

    const ranked = [...ports].sort((a, b) => portPriority(b) - portPriority(a));
    const best = ranked[0];
    if (best && portPriority(best) > 0) {
      return { selected: best, ports };
    }

    return { selected: ports[0], ports };
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function closeCurrentPort() {
    stopHeartbeat();
    if (!port) {
      return;
    }
    const activePort = port;
    port = null;
    await new Promise((resolve) => {
      activePort.close(() => resolve());
    });
  }

  function startHeartbeat(writeFn) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!port?.isOpen) {
        stopHeartbeat();
        return;
      }
      writeFn(lastStatus).catch((error) => {
        lastError = sanitizeError(error);
        stopHeartbeat();
      });
    }, HEARTBEAT_MS);
  }

  function attachPortEvents(activePort) {
    activePort.on('error', (error) => {
      lastError = sanitizeError(error);
    });
    activePort.on('close', () => {
      if (port === activePort) {
        port = null;
      }
    });
  }

  async function writeColor(status) {
    if (!port?.isOpen) {
      throw new Error('Arduino no conectado.');
    }
    lastStatus = validateStatus(status);
    await new Promise((resolve, reject) => {
      port.write(buildCommand(lastStatus), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    lastHeartbeatAt = now();
    startHeartbeat(async (nextStatus) => {
      await new Promise((resolve, reject) => {
        port.write(buildCommand(nextStatus), (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      lastHeartbeatAt = now();
    });
  }

  async function connectPort(payload = {}) {
    const ports = await listPorts();
    const requestedPath = payload.portPath
      ? validatePortPath(payload.portPath, ports)
      : undefined;
    const { selected, ports: availablePorts } = await pickDefaultPort(requestedPath);
    if (!selected) {
      throw new Error('No se encontraron puertos seriales disponibles.');
    }

    if (port?.isOpen && port.path === selected.path) {
      return {
        connected: true,
        portsFound: availablePorts.length,
        portInfo: sanitizePortInfo(portInfo),
        reused: true
      };
    }

    await closeCurrentPort();
    const baudRate = validateBaudRate(payload.baudRate, DEFAULT_BAUD_RATE);
    const nextPort = new SerialPort({ path: selected.path, baudRate, autoOpen: false });

    await new Promise((resolve, reject) => {
      nextPort.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, bootDelayMs));

    port = nextPort;
    portInfo = {
      path: selected.path,
      likelyArduino: matchesArduinoPort(selected)
    };
    attachPortEvents(nextPort);

    const savedPath = selected.path.startsWith('/dev/tty.')
      ? selected.path.replace('/dev/tty.', '/dev/cu.')
      : selected.path;
    writePreference(savedPath);
    lastError = '';

    return {
      connected: true,
      portsFound: availablePorts.length,
      portInfo: sanitizePortInfo(portInfo)
    };
  }

  async function getStatus() {
    const ports = await listPorts();
    return {
      connected: Boolean(port?.isOpen),
      portsFound: ports.length,
      portInfo: sanitizePortInfo(portInfo),
      lastError,
      lastHeartbeatAt
    };
  }

  async function setPreferredPort(payload = {}) {
    const ports = await listPorts();
    const preferredPath = validatePortPath(payload.portPath, ports);
    writePreference(preferredPath);
    return { preferredPath };
  }

  async function handleAction(action, payload = {}) {
    switch (action) {
      case 'connect': {
        const result = await connectPort(payload);
        const status = validateStatus(payload.status, lastStatus);
        await writeColor(status);
        result.lastHeartbeatAt = lastHeartbeatAt;
        return result;
      }
      case 'set_color':
        await writeColor(validateStatus(payload.status, lastStatus));
        return getStatus();
      case 'status':
        return getStatus();
      case 'disconnect':
        await closeCurrentPort();
        return getStatus();
      case 'set_preferred_port':
        return setPreferredPort(payload);
      case 'list_ports':
        return { ports: sanitizePortList(await listPorts(), matchesArduinoPort) };
      default:
        throw new Error('Acción no permitida.');
    }
  }

  return {
    handleAction,
    closeCurrentPort,
    stopHeartbeat,
    matchesArduinoPort,
    pickDefaultPort,
    buildCommand
  };
}

module.exports = {
  COMMANDS,
  DEFAULT_BAUD_RATE,
  HEARTBEAT_MS,
  matchesArduinoPort,
  isIgnoredPort,
  portPriority,
  buildCommand,
  createHostCore
};
