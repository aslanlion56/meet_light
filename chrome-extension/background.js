import { computeGlobalState, createConnectionState } from './connection-state.js';
import { createSerialHostTab } from './serial-host-tab.js';

const storage = createConnectionState(chrome.storage.local);
const serialHostTab = createSerialHostTab(chrome);

const tabStates = new Map();
let globalStatus = 'free';
let activePlatform = null;
let serialConnected = false;
let manualOverride = false;
let reconnectInFlight = null;

async function sendToSerialHost(message) {
  const tabId = await serialHostTab.ensureHostTab(storage);
  await serialHostTab.waitForTabLoad(tabId);
  await serialHostTab.waitForTabAlive(tabId);
  return serialHostTab.sendMessage(tabId, message);
}

async function sendLedState(status) {
  try {
    await sendToSerialHost({ type: 'LED_STATE', status });
  } catch (error) {
    await storage.persistDiagnostics({ lastError: error.message });
  }
}

async function updateGlobalState(force = false) {
  const { status, platform } = computeGlobalState(tabStates);

  if (!force && status === globalStatus && platform === activePlatform) {
    return;
  }

  globalStatus = status;
  activePlatform = platform;
  await storage.persistMeetingState(globalStatus, activePlatform);

  if (serialConnected && (!manualOverride || force)) {
    await sendLedState(globalStatus);
  }
}

async function queryLiveHostStatus() {
  const tabId = await storage.getSerialHostTabId();
  if (!tabId) {
    return null;
  }

  return serialHostTab.queryHost(tabId);
}

async function getStatusWithLiveSerial() {
  const data = await storage.getAll();
  const host = await queryLiveHostStatus();

  if (host?.alive) {
    const liveConnected = Boolean(host.connected);
    const portsFound = host.portsFound ?? data.portsFound ?? 0;
    const connectionState = liveConnected
      ? 'connected'
      : data.serialConnectionState === 'connecting'
        ? 'connecting'
        : 'disconnected';

    serialConnected = liveConnected;

    if (liveConnected !== Boolean(data.serialConnected)) {
      await storage.persistSerialStatus(liveConnected, connectionState, { portsFound });
    }

    return {
      ...data,
      status: data.status ?? globalStatus,
      platform: data.platform ?? activePlatform,
      serialConnected: liveConnected,
      serialConnectionState: connectionState,
      portsFound
    };
  }

  serialConnected = false;
  if (data.serialConnected) {
    await storage.persistSerialStatus(false, 'disconnected');
  }

  return {
    ...data,
    status: data.status ?? globalStatus,
    platform: data.platform ?? activePlatform,
    serialConnected: false,
    serialConnectionState: 'disconnected'
  };
}

async function attemptReconnect() {
  if (reconnectInFlight) {
    return reconnectInFlight;
  }

  reconnectInFlight = (async () => {
    const data = await storage.getAll();

    if (!data.portWasAuthorized && (data.portsFound ?? 0) === 0) {
      return { connected: false, skipped: true, reason: 'not_authorized' };
    }

    const tabId = await serialHostTab.ensureHostTab(storage);
    const host = await serialHostTab.queryHost(tabId);
    if (host?.connected) {
      serialConnected = true;
      await storage.persistSerialStatus(true, 'connected', {
        portsFound: host.portsFound ?? data.portsFound ?? 1
      });
      updateBadge(true, host.portsFound ?? 1);
      return { connected: true, skipped: true, reason: 'already_connected' };
    }

    await storage.persistMeetingState(globalStatus, activePlatform, {
      serialConnectionState: 'connecting',
      serialConnected: false
    });

    try {
      const result = await sendToSerialHost({ type: 'SERIAL_CONNECT' });

      await storage.persistDiagnostics({
        lastError: result?.connected ? '' : result?.error || 'Reconexión fallida',
        portsFound: result?.portsFound ?? 0,
        connected: Boolean(result?.connected)
      });

      if (result?.connected) {
        serialConnected = true;
        await storage.persistSerialStatus(true, 'connected', {
          portsFound: result?.portsFound ?? undefined,
          lastError: ''
        });
        updateBadge(true, result?.portsFound ?? 1);
        return result;
      }

      await storage.persistSerialStatus(false, 'disconnected');
      updateBadge(false, result?.portsFound ?? 0);
      return result;
    } catch (error) {
      await storage.persistDiagnostics({
        lastError: error.message,
        connected: false
      });
      await storage.persistSerialStatus(false, 'disconnected');
      updateBadge(false, 0);
      return { connected: false, error: error.message };
    }
  })();

  try {
    return await reconnectInFlight;
  } finally {
    reconnectInFlight = null;
  }
}

function updateBadge(connected, portsFound) {
  if (connected) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  if (portsFound === 0) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    return;
  }

  chrome.action.setBadgeText({ text: '…' });
  chrome.action.setBadgeBackgroundColor({ color: '#eab308' });
}

async function openSerialSetupTab() {
  const tabId = await serialHostTab.openSetupTab(storage);
  return { ok: true, tabId };
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

  if (message.type === 'HOST_READY') {
    const hostTabIdPromise = storage.getSerialHostTabId();
    hostTabIdPromise.then((hostTabId) => {
      if (sender.tab?.id && hostTabId === sender.tab.id) {
        serialHostTab.setReady(true);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, ignored: true });
      }
    });
    return true;
  }

  if (message.type === 'PIN_SERIAL_TAB') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs
        .update(tabId, { pinned: true, active: false })
        .then(() => storage.setSerialHostTabId(tabId))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    } else {
      sendResponse({ ok: false, error: 'Tab desconocida.' });
    }
    return true;
  }

  if (message.type === 'CONNECT_ARDUINO' || message.type === 'OPEN_SERIAL_SETUP') {
    openSerialSetupTab()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'RECONNECT_NOW') {
    storage.getAll().then(async (data) => {
      if ((data.portsFound ?? 0) === 0) {
        sendResponse(await openSerialSetupTab());
        return;
      }

      try {
        const tabId = await serialHostTab.ensureHostTab(storage);
        const alive = await serialHostTab.ping(tabId);
        if (!alive) {
          await serialHostTab.resetAndCreateHostTab(storage);
        }

        const result = await attemptReconnect();
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, connected: false, error: error.message });
      }
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    getStatusWithLiveSerial()
      .then((data) => {
        updateBadge(
          Boolean(data.serialConnected),
          data.portsFound ?? (data.serialConnected ? 1 : 0)
        );
        sendResponse(data);
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'SERIAL_STATUS') {
    serialConnected = Boolean(message.connected);
    const connectionState =
      message.connectionState || (serialConnected ? 'connected' : 'disconnected');

    storage
      .persistSerialStatus(serialConnected, connectionState, {
        portsFound: message.portsFound ?? undefined,
        lastError: message.error ?? undefined,
        lastHeartbeatAt: message.lastHeartbeatAt ?? undefined,
        portInfo: message.portInfo ?? undefined
      })
      .then(async () => {
        updateBadge(serialConnected, message.portsFound ?? (serialConnected ? 1 : 0));
        if (serialConnected) {
          manualOverride = false;
          await updateGlobalState(true);
        }
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === 'MANUAL_LED') {
    manualOverride = true;
    sendToSerialHost({ type: 'MANUAL_LED', status: message.status })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'RESTORE_LED') {
    manualOverride = false;
    updateGlobalState(true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const hostTabId = await storage.getSerialHostTabId();

  if (hostTabId === tabId) {
    serialHostTab.setReady(false);
    await storage.clearSerialHostTabId();
    serialConnected = false;
    await storage.persistSerialStatus(false, 'disconnected');
    updateBadge(false, 0);
  }

  if (tabStates.delete(tabId)) {
    updateGlobalState();
  }
});
