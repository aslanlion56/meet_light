'use strict';

const tabStates = new Map();
let globalStatus = 'free';
let activePlatform = null;
let serialConnected = false;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Mantener la conexión Web Serial con el Arduino Uno.'
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function sendToOffscreen(message) {
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw lastError;
}

function computeGlobalState() {
  let waitingPlatform = null;

  for (const state of tabStates.values()) {
    if (state.status === 'active') {
      return { status: 'active', platform: state.platform };
    }

    if (state.status === 'waiting' && !waitingPlatform) {
      waitingPlatform = state.platform;
    }
  }

  if (waitingPlatform) {
    return { status: 'waiting', platform: waitingPlatform };
  }

  return { status: 'free', platform: null };
}

async function persistState(status, platform) {
  await chrome.storage.local.set({ status, platform });
}

async function sendLedState(status) {
  await ensureOffscreen();

  try {
    await sendToOffscreen({
      type: 'LED_STATE',
      status
    });
  } catch {
    // El documento offscreen puede no estar listo todavía.
  }
}

async function updateGlobalState(force = false) {
  const { status, platform } = computeGlobalState();

  if (!force && status === globalStatus && platform === activePlatform) return;

  globalStatus = status;
  activePlatform = platform;

  await persistState(globalStatus, activePlatform);

  if (serialConnected) {
    await sendLedState(globalStatus);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEETING_STATE' && sender.tab?.id != null) {
    tabStates.set(sender.tab.id, {
      status: message.status,
      platform: message.platform
    });
    updateGlobalState()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'CONNECT_ARDUINO') {
    ensureOffscreen()
      .then(() =>
        sendToOffscreen({
          type: 'SERIAL_CONNECT',
          requestPort: Boolean(message.requestPort)
        })
      )
      .then(async (result) => {
        if (result?.ok) {
          await updateGlobalState(true);
        }
        return result;
      })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.storage.local
      .get(['status', 'platform', 'serialConnected'])
      .then((data) => sendResponse(data));
    return true;
  }

  if (message.type === 'SERIAL_STATUS') {
    serialConnected = Boolean(message.connected);
    chrome.storage.local
      .set({ serialConnected })
      .then(async () => {
        if (serialConnected) {
          await updateGlobalState(true);
        }
        sendResponse({ ok: true });
      });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates.delete(tabId)) {
    updateGlobalState();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
});

// Reenvía el estado al Arduino cada 3 s por si se perdió un comando tras el reset.
setInterval(async () => {
  const data = await chrome.storage.local.get(['serialConnected', 'status']);
  if (!data.serialConnected || !data.status) return;

  try {
    await sendToOffscreen({ type: 'RESYNC_LED' });
  } catch {
    // Ignorar si offscreen no está listo.
  }
}, 3000);
