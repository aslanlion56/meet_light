import { computeGlobalState } from './connection-state.js';

export function createMeetingController({ storage, serialBridge }) {
  const tabStates = new Map();
  let globalStatus = 'free';
  let activePlatform = null;

  async function updateGlobalState(force = false) {
    const { status, platform } = computeGlobalState(tabStates);

    if (!force && status === globalStatus && platform === activePlatform) {
      return { status: globalStatus, platform: activePlatform };
    }

    globalStatus = status;
    activePlatform = platform;
    serialBridge.setGlobalStatus(globalStatus);
    await storage.persistMeetingState(globalStatus, activePlatform);

    if (serialBridge.isSerialConnected()) {
      await serialBridge.sendLedState(globalStatus);
    }

    return { status: globalStatus, platform: activePlatform };
  }

  function setTabState(tabId, state) {
    tabStates.set(tabId, state);
  }

  function hasTabState(tabId) {
    return tabStates.has(tabId);
  }

  function removeTabState(tabId) {
    return tabStates.delete(tabId);
  }

  function getSnapshot() {
    return { status: globalStatus, platform: activePlatform };
  }

  return {
    updateGlobalState,
    setTabState,
    hasTabState,
    removeTabState,
    getSnapshot
  };
}
