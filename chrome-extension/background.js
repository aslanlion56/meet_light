import { createConnectionState } from './connection-state.js';
import { createNativeSerialClient } from './native-serial-client.js';
import { createSerialHostTab } from './serial-host-tab.js';
import { createSerialBridge } from './serial-bridge.js';
import { createMeetingController } from './meeting-controller.js';
import { createMeetingLog } from './meeting-log.js';
import { assertAuthorized, isMeetingUrl, platformFromUrl } from './message-auth.js';
import { createActionIcon } from './action-icon.js';
import { MESSAGE_TYPES, normalizeMessageType } from './message-types.js';
import { NATIVE_HOST_NAME } from './constants.js';
import { createCloudSync } from './cloud-sync.js';
import { FIREBASE_CONFIG, REPORT_ORIGIN } from './firebase-config.js';

const storage = createConnectionState(chrome.storage.local);
const serialHostTab = createSerialHostTab(chrome);
const nativeSerial = createNativeSerialClient(chrome, NATIVE_HOST_NAME);

const actionIcon = createActionIcon(chrome);

// El icono de la barra replica el LED físico (gris si no hay conexión serial).
function refreshIcon() {
  actionIcon.update(serialBridge.getLedStatus(), serialBridge.isSerialConnected());
}

function updateBadge(connected, portsFound) {
  refreshIcon();
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

function logError(error) {
  console.warn('[Meet Light] Registro de juntas:', error);
}

const meetingLog = createMeetingLog({
  storageApi: chrome.storage.local,
  // Sin await: la subida usa la misma cola del registro y no debe bloquearla.
  onSessionEnded: () => {
    cloudSync.syncPending().catch(logError);
  }
});

const cloudSync = createCloudSync({
  storageApi: chrome.storage.local,
  meetingLog,
  config: FIREBASE_CONFIG
});

async function closeOrphanMeetingSessions() {
  const tabs = await chrome.tabs.query({});
  await meetingLog.closeOrphanSessions(tabs.map((tab) => tab.id));
}

// El service worker pudo reiniciarse: cierra juntas cuya pestaña ya no existe
// y reintenta subir lo que haya quedado pendiente (p. ej. por falta de red).
closeOrphanMeetingSessions()
  .then(() => cloudSync.syncPending())
  .catch(logError);

// La página de reportes entrega la sesión de Firebase tras iniciar con Google.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.origin !== REPORT_ORIGIN || message?.type !== 'LINK_ACCOUNT') {
    sendResponse({ ok: false, error: 'Origen no autorizado.' });
    return false;
  }

  cloudSync
    .linkAccount(message)
    .then(() => {
      cloudSync.syncPending().catch(logError);
      sendResponse({ ok: true });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
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
    if (message.status === 'active') {
      meetingLog.trackSession(sender.tab.id, message.platform).catch(logError);
    } else {
      meetingLog.endSession(sender.tab.id).catch(logError);
    }
    meetingController
      .updateGlobalState()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
      .finally(refreshIcon);
    return true;
  }

  if (type === MESSAGE_TYPES.MEETING_INFO && sender.tab?.id != null) {
    // Solo se envía durante una junta activa; también re-sincroniza el estado
    // si el service worker se reinició y perdió las pestañas en memoria.
    meetingController.setTabState(sender.tab.id, {
      status: 'active',
      platform: message.platform
    });
    meetingController.updateGlobalState().catch(logError).finally(refreshIcon);
    meetingLog
      .trackSession(sender.tab.id, message.platform, {
        title: message.title,
        meetingCode: message.meetingCode,
        participants: message.participants
      })
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
      .catch((error) => sendResponse({ ok: false, error: error.message }))
      .finally(refreshIcon);
    return true;
  }

  if (type === MESSAGE_TYPES.RESTORE_LED) {
    serialBridge
      .restoreAutomaticLed((force) => meetingController.updateGlobalState(force))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
      .finally(refreshIcon);
    return true;
  }

  if (type === MESSAGE_TYPES.CLOUD_STATUS) {
    cloudSync
      .getStatus()
      .then((status) => sendResponse({ ok: true, ...status }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.CLOUD_SYNC) {
    cloudSync
      .syncPending()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.CLOUD_UNLINK) {
    cloudSync
      .unlinkAccount()
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
  }
  if (meetingController.removeTabState(tabId)) {
    meetingController.updateGlobalState().catch(logError).finally(refreshIcon);
  }
  meetingLog.endSession(tabId).catch(logError);
});

// La pestaña navegó fuera de Meet/Teams: el content script ya no avisará.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url || isMeetingUrl(changeInfo.url)) {
    return;
  }
  if (meetingController.removeTabState(tabId)) {
    meetingController.updateGlobalState().catch(logError).finally(refreshIcon);
  }
  meetingLog.endSession(tabId).catch(logError);
});

const MEETING_URL_PATTERNS = [
  'https://meet.google.com/*',
  'https://teams.microsoft.com/*',
  'https://teams.live.com/*'
];

/**
 * Al arrancar el service worker la memoria está vacía aunque haya pestañas de
 * Meet/Teams abiertas. Se reconstruye el estado desde las pestañas reales para
 * que LED, popup e icono partan de lo mismo; cada content script lo afina
 * después (espera/en junta) con su reporte periódico.
 */
async function syncOpenMeetingTabs() {
  const tabs = await chrome.tabs.query({ url: MEETING_URL_PATTERNS });
  for (const tab of tabs) {
    if (tab.id != null && !meetingController.hasTabState(tab.id)) {
      meetingController.setTabState(tab.id, {
        status: 'waiting',
        platform: platformFromUrl(tab.url)
      });
    }
  }
  await meetingController.updateGlobalState(true);
  return tabs;
}

async function initialize() {
  await syncOpenMeetingTabs().catch(logError);
  try {
    await serialBridge.bootstrap();
    // bootstrap pudo conectar después de calcular el estado: reenvía el color.
    await meetingController.updateGlobalState(true);
  } catch {
    serialBridge.stopHeartbeatLoop();
    updateBadge(false, 0);
  }
  refreshIcon();
}

initialize();

chrome.runtime.onStartup.addListener(() => {
  // Chrome arrancó de cero: ninguna junta guardada sigue viva.
  meetingLog.closeOrphanSessions([]).catch(logError);
});

// Al instalar o recargar la extensión, los content scripts de las pestañas ya
// abiertas quedan desconectados: se vuelven a inyectar para no tener que
// recargar Meet/Teams.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') {
    return;
  }
  const tabs = await chrome.tabs.query({ url: MEETING_URL_PATTERNS }).catch(() => []);
  for (const tab of tabs) {
    const file = platformFromUrl(tab.url) === 'meet' ? 'content-meet.js' : 'content-teams.js';
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: [file] })
      .catch(logError);
  }
});
