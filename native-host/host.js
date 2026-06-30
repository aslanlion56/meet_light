#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SerialPort } = require('serialport');
const { MAX_MESSAGE_BYTES, validateAction, sanitizeError } = require('./protocol');
const { createHostCore } = require('./host-core');

const PREFERENCE_FILE = path.join(os.homedir(), '.meet-light-native-host.json');

function readPreference() {
  try {
    const raw = fs.readFileSync(PREFERENCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed.preferredPath === 'string' ? parsed.preferredPath : null;
  } catch {
    return null;
  }
}

function writePreference(preferredPath) {
  try {
    fs.writeFileSync(
      PREFERENCE_FILE,
      JSON.stringify({ preferredPath, updatedAt: Date.now() }, null, 2),
      { mode: 0o600 }
    );
  } catch {
    // ignore preference write errors
  }
}

function send(message) {
  const json = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  fs.writeSync(1, header);
  fs.writeSync(1, json);
}

function respond(id, ok, result, error) {
  send({
    id,
    ok,
    result: result ?? null,
    error: error ? sanitizeError({ message: error }) : null
  });
}

const host = createHostCore({
  SerialPort,
  readPreference,
  writePreference
});

let messageChain = Promise.resolve();

function enqueueMessage(message) {
  messageChain = messageChain
    .then(async () => {
      const { id, action, payload } = message || {};
      const safeAction = validateAction(action);
      const result = await host.handleAction(safeAction, payload ?? {});
      respond(id, true, result, null);
    })
    .catch((error) => {
      respond(message?.id ?? null, false, null, sanitizeError(error));
    });
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const messageLength = buffer.readUInt32LE(0);
    if (messageLength === 0 || messageLength > MAX_MESSAGE_BYTES) {
      respond(null, false, null, 'Mensaje inválido.');
      buffer = Buffer.alloc(0);
      break;
    }
    if (buffer.length < messageLength + 4) {
      break;
    }
    const messageRaw = buffer.slice(4, messageLength + 4).toString('utf8');
    buffer = buffer.slice(messageLength + 4);

    try {
      enqueueMessage(JSON.parse(messageRaw));
    } catch (error) {
      respond(null, false, null, sanitizeError(error));
    }
  }
});

process.stdin.on('end', async () => {
  host.stopHeartbeat();
  await host.closeCurrentPort();
  process.exit(0);
});
