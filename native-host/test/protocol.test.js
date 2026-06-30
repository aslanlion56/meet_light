'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeError,
  validateAction,
  validateBaudRate,
  validatePortPath,
  validateStatus
} = require('../protocol');

test('protocol validates actions and statuses', () => {
  assert.equal(validateAction('connect'), 'connect');
  assert.equal(validateStatus('active'), 'active');
  assert.throws(() => validateAction('exec'), /Acción no permitida/);
  assert.throws(() => validateStatus('hack'), /Estado LED no permitido/);
});

test('protocol validates baud rate and port path', () => {
  assert.equal(validateBaudRate(9600), 9600);
  assert.throws(() => validateBaudRate(999999), /Velocidad serial no permitida/);
  assert.equal(
    validatePortPath('/dev/cu.usbserial-1', [{ path: '/dev/cu.usbserial-1' }]),
    '/dev/cu.usbserial-1'
  );
  assert.throws(() => validatePortPath('/dev/missing', []), /Puerto no disponible/);
});

test('protocol sanitizes filesystem paths from errors', () => {
  const sanitized = sanitizeError(new Error('open /Users/me/dev/tty.usbserial failed'));
  assert.match(sanitized, /\[ruta\]/);
  assert.doesNotMatch(sanitized, /\/Users\/me/);
});
