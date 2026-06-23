import { describe, expect, it, vi } from 'vitest';
import { computeGlobalState, createConnectionState } from '../connection-state.js';

describe('connection-state', () => {
  it('computes global state with active priority', () => {
    const tabStates = new Map([
      [1, { status: 'waiting', platform: 'meet' }],
      [2, { status: 'active', platform: 'teams' }]
    ]);

    expect(computeGlobalState(tabStates)).toEqual({
      status: 'active',
      platform: 'teams'
    });
  });

  it('computes waiting when no active tabs exist', () => {
    const tabStates = new Map([[1, { status: 'waiting', platform: 'meet' }]]);

    expect(computeGlobalState(tabStates)).toEqual({
      status: 'waiting',
      platform: 'meet'
    });
  });

  it('defaults to free when no tabs tracked', () => {
    expect(computeGlobalState(new Map())).toEqual({
      status: 'free',
      platform: null
    });
  });

  it('persists diagnostics with timestamp', async () => {
    const storage = {
      data: {},
      get: vi.fn(async (keys) => {
        const result = {};
        for (const key of keys) {
          result[key] = storage.data[key];
        }
        return result;
      }),
      set: vi.fn(async (values) => {
        Object.assign(storage.data, values);
      }),
      remove: vi.fn(async (keys) => {
        for (const key of keys) {
          delete storage.data[key];
        }
      })
    };

    const connectionState = createConnectionState(storage);
    await connectionState.persistDiagnostics({
      lastError: 'fallo',
      portsFound: 0,
      connected: false
    });

    expect(storage.set).toHaveBeenCalled();
    expect(storage.data.lastError).toBe('fallo');
    expect(storage.data.portsFound).toBe(0);
    expect(typeof storage.data.lastReconnectAttempt).toBe('number');
  });
});
