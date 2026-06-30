import { describe, expect, it, vi } from 'vitest';
import { createNativeSerialClient } from '../native-serial-client.js';

describe('native-serial-client', () => {
  it('resolves successful native responses', async () => {
    const listeners = { message: null, disconnect: null };
    const port = {
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn((fn) => { listeners.message = fn; }) },
      onDisconnect: { addListener: vi.fn((fn) => { listeners.disconnect = fn; }) },
      disconnect: vi.fn()
    };

    const chromeApi = {
      runtime: {
        lastError: null,
        connectNative: vi.fn(() => port)
      }
    };

    const client = createNativeSerialClient(chromeApi, 'com.meetlight.serial_host');
    const promise = client.send('status');

    expect(port.postMessage).toHaveBeenCalledWith({
      id: 1,
      action: 'status',
      payload: {}
    });

    listeners.message({ id: 1, ok: true, result: { connected: true, portsFound: 1 } });
    await expect(promise).resolves.toEqual({ connected: true, portsFound: 1 });
  });

  it('maps missing native host errors to actionable message', async () => {
    const chromeApi = {
      runtime: {
        lastError: { message: 'Specified native messaging host not found.' },
        connectNative: vi.fn(() => null)
      }
    };

    const client = createNativeSerialClient(chromeApi, 'com.meetlight.serial_host');
    await expect(client.send('status')).rejects.toThrow(/Host nativo no instalado/);
  });
});
