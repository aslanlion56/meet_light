'use strict';

const MAX_MESSAGE_BYTES = 1_048_576;
const ALLOWED_ACTIONS = new Set([
  'connect',
  'set_color',
  'status',
  'disconnect',
  'set_preferred_port',
  'list_ports'
]);
const ALLOWED_STATUSES = new Set(['free', 'waiting', 'active']);
const MIN_BAUD_RATE = 300;
const MAX_BAUD_RATE = 115200;

function sanitizeError(error) {
  const raw = error?.message || String(error || 'Error desconocido.');
  return raw
    .replace(/\/(?:Users|home|var|tmp)[^\s]*/gi, '[ruta]')
    .replace(/[A-Z]:\\[^\s]*/gi, '[ruta]')
    .slice(0, 240);
}

function validateAction(action) {
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    throw new Error('Acción no permitida.');
  }
  return action;
}

function validateStatus(status, fallback = 'free') {
  const value = status ?? fallback;
  if (!ALLOWED_STATUSES.has(value)) {
    throw new Error('Estado LED no permitido.');
  }
  return value;
}

function validateBaudRate(value, fallback = 9600) {
  const baudRate = Number(value ?? fallback);
  if (!Number.isInteger(baudRate) || baudRate < MIN_BAUD_RATE || baudRate > MAX_BAUD_RATE) {
    throw new Error('Velocidad serial no permitida.');
  }
  return baudRate;
}

function validatePortPath(portPath, availablePorts) {
  if (typeof portPath !== 'string' || portPath.length === 0) {
    throw new Error('portPath inválido.');
  }
  const exists = availablePorts.some((item) => item.path === portPath);
  if (!exists) {
    throw new Error('Puerto no disponible.');
  }
  return portPath;
}

function sanitizePortInfo(portInfo) {
  if (!portInfo) {
    return null;
  }
  return {
    path: portInfo.path || '',
    likelyArduino: Boolean(portInfo.likelyArduino)
  };
}

function sanitizePortList(ports, matchesArduinoPort) {
  return ports.map((port) => ({
    path: port.path,
    likelyArduino: matchesArduinoPort(port)
  }));
}

module.exports = {
  MAX_MESSAGE_BYTES,
  ALLOWED_ACTIONS,
  ALLOWED_STATUSES,
  sanitizeError,
  validateAction,
  validateStatus,
  validateBaudRate,
  validatePortPath,
  sanitizePortInfo,
  sanitizePortList
};
