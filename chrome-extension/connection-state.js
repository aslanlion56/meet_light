export const STORAGE_KEYS = [
  'status',
  'platform',
  'serialConnected',
  'serialConnectionState',
  'portWasAuthorized',
  'lastReconnectAttempt',
  'lastError',
  'portsFound',
  'hostReady',
  'lastHeartbeatAt',
  'portInfo'
];

export function createConnectionState(storageApi) {
  async function getAll() {
    return storageApi.get(STORAGE_KEYS);
  }

  async function persistMeetingState(status, platform, extra = {}) {
    await storageApi.set({ status, platform, ...extra });
  }

  async function persistDiagnostics(diagnostics) {
    await storageApi.set({
      lastReconnectAttempt: Date.now(),
      ...diagnostics
    });
  }

  async function persistSerialStatus(connected, connectionState, extra = {}) {
    await storageApi.set({
      serialConnected: connected,
      serialConnectionState: connectionState,
      ...(connected ? { portWasAuthorized: true } : {}),
      ...extra
    });
  }

  async function clearSerialHostTabId() {
    await storageApi.remove('serialHostTabId');
  }

  async function setSerialHostTabId(tabId) {
    await storageApi.set({ serialHostTabId: tabId });
  }

  async function getSerialHostTabId() {
    const data = await storageApi.get(['serialHostTabId']);
    return data.serialHostTabId ?? null;
  }

  return {
    getAll,
    persistMeetingState,
    persistDiagnostics,
    persistSerialStatus,
    clearSerialHostTabId,
    setSerialHostTabId,
    getSerialHostTabId
  };
}

export function computeGlobalState(tabStates) {
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
