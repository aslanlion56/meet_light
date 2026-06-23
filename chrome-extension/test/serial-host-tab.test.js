import { describe, expect, it, vi } from 'vitest';
import { createSerialHostTab } from '../serial-host-tab.js';

function createChromeApi(overrides = {}) {
  const baseTabs = {
    query: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 99, status: 'complete' }),
    get: vi.fn().mockResolvedValue({ id: 99, status: 'complete' }),
    update: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ alive: true }),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  };

  return {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://abc/${path}`)
    },
    tabs: { ...baseTabs, ...(overrides.tabs || {}) },
    ...overrides
  };
}

function createStorageMock() {
  const data = {};
  return {
    data,
    clearSerialHostTabId: vi.fn(async () => {
      delete data.serialHostTabId;
    }),
    setSerialHostTabId: vi.fn(async (tabId) => {
      data.serialHostTabId = tabId;
    })
  };
}

describe('serial-host-tab', () => {
  it('finds tabs with setup query string', async () => {
    const chromeApi = createChromeApi({
      tabs: {
        ...createChromeApi().tabs,
        query: vi.fn().mockResolvedValue([
          { id: 1, url: 'https://google.com' },
          { id: 10, url: 'chrome-extension://abc/serial-host.html?setup=1' }
        ])
      }
    });

    const hostTab = createSerialHostTab(chromeApi);
    const tabs = await hostTab.findTabs();

    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe(10);
  });

  it('removes duplicate tabs and keeps the first one', async () => {
    const storage = createStorageMock();
    const chromeApi = createChromeApi({
      tabs: {
        ...createChromeApi().tabs,
        query: vi.fn().mockResolvedValue([
          { id: 10, url: 'chrome-extension://abc/serial-host.html' },
          { id: 11, url: 'chrome-extension://abc/serial-host.html?setup=1' }
        ])
      }
    });

    const hostTab = createSerialHostTab(chromeApi);
    const tabId = await hostTab.ensureHostTab(storage);

    expect(tabId).toBe(10);
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith([11]);
    expect(storage.setSerialHostTabId).toHaveBeenCalledWith(10);
  });

  it('opens setup tab in existing tab when possible', async () => {
    const storage = createStorageMock();
    const chromeApi = createChromeApi({
      tabs: {
        ...createChromeApi().tabs,
        query: vi.fn().mockResolvedValue([
          { id: 20, url: 'chrome-extension://abc/serial-host.html?setup=1' }
        ])
      }
    });

    const hostTab = createSerialHostTab(chromeApi);
    const tabId = await hostTab.openSetupTab(storage);

    expect(tabId).toBe(20);
    expect(chromeApi.tabs.update).toHaveBeenCalledWith(20, {
      active: true,
      url: 'chrome-extension://abc/serial-host.html?setup=1'
    });
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
  });

  it('waits for tab ping before declaring host alive', async () => {
    let pingCount = 0;
    const chromeApi = createChromeApi({
      tabs: {
        ...createChromeApi().tabs,
        sendMessage: vi.fn().mockImplementation(async (_tabId, message) => {
          if (message.type === 'PING') {
            pingCount += 1;
            if (pingCount >= 2) return { alive: true };
            throw new Error('not ready');
          }
          return {};
        })
      }
    });

    const hostTab = createSerialHostTab(chromeApi);
    await expect(hostTab.waitForTabAlive(55, 5000)).resolves.toBeUndefined();
    expect(hostTab.isReady()).toBe(true);
  });

  it('serializes concurrent creation requests with shared lock', async () => {
    const storage = createStorageMock();
    const chromeApi = createChromeApi({
      tabs: {
        ...createChromeApi().tabs,
        query: vi.fn().mockResolvedValue([])
      }
    });

    const hostTab = createSerialHostTab(chromeApi);
    const [tabA, tabB] = await Promise.all([
      hostTab.ensureHostTab(storage),
      hostTab.openSetupTab(storage)
    ]);

    expect(tabA).toBe(tabB);
    expect(chromeApi.tabs.create).toHaveBeenCalledTimes(1);
  });
});
