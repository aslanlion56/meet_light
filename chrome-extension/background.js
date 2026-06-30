import { createConnectionState } from './connection-state.js';
import { createNativeSerialClient } from './native-serial-client.js';
import { createSerialHostTab } from './serial-host-tab.js';
import { createSerialBridge } from './serial-bridge.js';
import { createMeetingController } from './meeting-controller.js';
import { assertAuthorized } from './message-auth.js';
import { MESSAGE_TYPES, normalizeMessageType } from './message-types.js';
import { NATIVE_HOST_NAME } from './constants.js';

const storage = createConnectionState(chrome.storage.local);
const serialHostTab = createSerialHostTab(chrome);
const nativeSerial = createNativeSerialClient(chrome, NATIVE_HOST_NAME);

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

const serialBridge = createSerialBridge({
  nativeSerial,
  storage,
  onBadgeChange: updateBadge
});

const meetingController = createMeetingController({
  storage,
  serialBridge
});

async function openSerialSetupTab() {
  const tabId = await serialHostTab.openSetupTab(storage);
  return { ok: true, tabId };
}

async function handleReconnect(openSetupOnFailure) {
  const result = await serialBridge.attemptReconnect();
  if (!result.connected && openSetupOnFailure) {
    await openSerialSetupTab();
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = normalizeMessageType(message.type);

  try {
    assertAuthorized(type, sender, chrome);
  } catch (error) {
    sendResponse({ ok: false, error: error.message, ignored: true });
    return type === MESSAGE_TYPES.HOST_READY;
  }

  if (type === MESSAGE_TYPES.MEETING_STATE && sender.tab?.id != null) {
    meetingController.setTabState(sender.tab.id, {
      status: message.status,
      platform: message.platform
    });
    meetingController
      .updateGlobalState()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.HOST_READY) {
    storage.getSerialHostTabId().then(async (hostTabId) => {
      if (sender.tab?.id && hostTabId === sender.tab.id) {
        serialHostTab.setReady(true);
        sendResponse({ ok: true });
        return;
      }
      if (sender.tab?.id) {
        await storage.setSerialHostTabId(sender.tab.id);
        serialHostTab.setReady(true);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, ignored: true });
    });
    return true;
  }

  if (type === MESSAGE_TYPES.PIN_SERIAL_TAB) {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'Tab desconocida.' });
      return true;
    }
    chrome.tabs
      .update(tabId, { pinned: true, active: false })
      .then(() => storage.setSerialHostTabId(tabId))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.RECONNECT) {
    const openSetupOnFailure =
      message.openSetupOnFailure ?? (message.type === 'RECONNECT_NOW' ? 'no-ports' : 'always');
    handleReconnect(openSetupOnFailure === 'always' || openSetupOnFailure === true)
      .then((result) => {
        if (
          !result.connected &&
          openSetupOnFailure === 'no-ports' &&
          (result.portsFound ?? 0) === 0
        ) {
          return openSerialSetupTab().then(() => result);
        }
        return result;
      })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, connected: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.GET_STATUS) {
    const snapshot = meetingController.getSnapshot();
    serialBridge
      .getStatusWithLiveSerial(snapshot.status, snapshot.platform)
      .then((data) => {
        updateBadge(Boolean(data.serialConnected), data.portsFound ?? 0);
        sendResponse(data);
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.MANUAL_LED) {
    serialBridge
      .setManualColor(message.status)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.RESTORE_LED) {
    serialBridge
      .restoreAutomaticLed((force) => meetingController.updateGlobalState(force))
      .then((result) => sendResponse(result))
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
  }
  if (meetingController.removeTabState(tabId)) {
    meetingController.updateGlobalState();
  }
});

chrome.runtime.onStartup.addListener(() => {
  serialBridge.bootstrap().catch(() => {
    serialBridge.stopHeartbeatLoop();
    updateBadge(false, 0);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  serialBridge.bootstrap().catch(() => {
    serialBridge.stopHeartbeatLoop();
    updateBadge(false, 0);
  });
});
