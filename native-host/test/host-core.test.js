'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHostCore, matchesArduinoPort, portPriority } = require('../host-core');

test('host-core prioritizes likely Arduino ports', () => {
  const arduino = { path: '/dev/cu.usbserial-14110', vendorId: '1a86' };
  const bluetooth = { path: '/dev/cu.Bluetooth-Incoming-Port' };
  assert.equal(matchesArduinoPort(arduino), true);
  assert.ok(portPriority(arduino) > portPriority(bluetooth));
});

test('host-core builds command bytes with newline', () => {
  const host = createHostCore({
    SerialPort: { list: async () => [] },
    readPreference: () => null,
    writePreference: () => {},
    bootDelayMs: 0
  });
  assert.deepEqual(host.buildCommand('free'), Buffer.from([48, 10]));
});
