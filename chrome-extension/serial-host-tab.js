export function createSerialHostTab(chromeApi) {
  let creatingHostTab = null;
  let serialHostReady = false;

  function getSerialHostUrl() {
    return chromeApi.runtime.getURL('serial-host.html');
  }

  function isSerialHostUrl(url) {
    return Boolean(url?.includes('serial-host.html'));
  }

  function setReady(ready) {
    serialHostReady = ready;
  }

  function isReady() {
    return serialHostReady;
  }

  async function findTabs() {
    const allTabs = await chromeApi.tabs.query({});
    return allTabs.filter((tab) => isSerialHostUrl(tab.url));
  }

  async function dedupeTabs(storage) {
    const tabs = await findTabs();
    if (tabs.length === 0) {
      return null;
    }

    const keepTab = tabs[0];
    if (tabs.length > 1) {
      await removeTabs(tabs.slice(1).map((tab) => tab.id));
    }
    await storage.setSerialHostTabId(keepTab.id);
    return keepTab;
  }

  async function removeTabs(tabIds) {
    if (tabIds.length === 0) return;
    try {
      await chromeApi.tabs.remove(tabIds);
    } catch {
      /* ignore */
    }
  }

  async function waitForTabLoad(tabId, timeoutMs = 30000) {
    try {
      const tab = await chromeApi.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch {
      /* ignore */
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chromeApi.tabs.onUpdated.removeListener(listener);
        reject(new Error('La pestaña serial no cargó a tiempo.'));
      }, timeoutMs);

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chromeApi.tabs.onUpdated.removeListener(listener);
          clearTimeout(timer);
          resolve();
        }
      }

      chromeApi.tabs.onUpdated.addListener(listener);
    });
  }

  async function createHostTab(storage, { active = false, setup = false } = {}) {
    serialHostReady = false;
    const url = setup
      ? `${getSerialHostUrl()}?setup=1`
      : getSerialHostUrl();

    const tab = await chromeApi.tabs.create({
      url,
      active,
      pinned: !active
    });
    await storage.setSerialHostTabId(tab.id);
    await waitForTabLoad(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return tab.id;
  }

  async function withCreationLock(task) {
    if (!creatingHostTab) {
      creatingHostTab = task().finally(() => {
        creatingHostTab = null;
      });
    }
    return creatingHostTab;
  }

  async function ensureHostTab(storage) {
    const existing = await dedupeTabs(storage);
    if (existing) {
      return existing.id;
    }
    return withCreationLock(async () => createHostTab(storage));
  }

  async function openSetupTab(storage) {
    return withCreationLock(async () => {
      const existing = await dedupeTabs(storage);
      const setupUrl = `${getSerialHostUrl()}?setup=1`;

      if (existing) {
        await chromeApi.tabs.update(existing.id, { active: true, url: setupUrl });
        await storage.setSerialHostTabId(existing.id);
        await waitForTabLoad(existing.id);
        return existing.id;
      }

      return createHostTab(storage, { active: true, setup: true });
    });
  }

  async function resetAndCreateHostTab(storage) {
    return withCreationLock(async () => {
      const tabs = await findTabs();
      await removeTabs(tabs.map((tab) => tab.id));
      await storage.clearSerialHostTabId();
      serialHostReady = false;
      return createHostTab(storage);
    });
  }

  async function waitForTabAlive(tabId, timeoutMs = 30000) {
    if (serialHostReady) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (serialHostReady) return;
      if (await ping(tabId)) {
        serialHostReady = true;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error('La pestaña serial no respondió a tiempo.');
  }

  async function queryHost(tabId) {
    try {
      return await chromeApi.tabs.sendMessage(tabId, { type: 'PING' });
    } catch {
      return null;
    }
  }

  async function ping(tabId) {
    const response = await queryHost(tabId);
    return Boolean(response?.alive);
  }

  async function sendMessage(tabId, message, retries = 10) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        return await chromeApi.tabs.sendMessage(tabId, message);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  return {
    isSerialHostUrl,
    setReady,
    isReady,
    findTabs,
    dedupeTabs,
    createHostTab,
    ensureHostTab,
    openSetupTab,
    resetAndCreateHostTab,
    waitForTabLoad,
    waitForTabAlive,
    queryHost,
    ping,
    sendMessage
  };
}
