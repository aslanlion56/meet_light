import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_COMMANDS,
  buildCommandBytes,
  createSerialManager,
  statusToCommand
} from '../serial-manager.js';

describe('serial-manager', () => {
  it('maps status to command bytes', () => {
    expect(statusToCommand('free')).toBe(STATUS_COMMANDS.free);
    expect(statusToCommand('waiting')).toBe(STATUS_COMMANDS.waiting);
    expect(statusToCommand('active')).toBe(STATUS_COMMANDS.active);
    expect(statusToCommand('unknown')).toBe(STATUS_COMMANDS.free);
  });

  it('builds newline-terminated command payload', () => {
    expect(Array.from(buildCommandBytes('free'))).toEqual([48, 10]);
    expect(Array.from(buildCommandBytes('active'))).toEqual([50, 10]);
  });

  it('returns connected when port opens successfully', async () => {
    const writer = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn()
    };

    const port = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      writable: { getWriter: () => writer },
      readable: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true }),
          cancel: vi.fn(),
          releaseLock: vi.fn()
        })
      },
      addEventListener: vi.fn(),
      getInfo: () => ({ usbVendorId: 0x2341 })
    };

    const serialApi = {
      getPorts: vi.fn().mockResolvedValue([port])
    };

    const manager = createSerialManager(serialApi);
    const result = await manager.connect({ bootMs: 0 });

    expect(result.connected).toBe(true);
    expect(result.portsFound).toBe(1);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 });
    expect(manager.isConnected()).toBe(true);
  });

  it('returns error when no granted ports exist', async () => {
    const serialApi = {
      getPorts: vi.fn().mockResolvedValue([])
    };

    const manager = createSerialManager(serialApi);
    const result = await manager.connect({ bootMs: 0 });

    expect(result.connected).toBe(false);
    expect(result.portsFound).toBe(0);
    expect(result.error).toContain('No hay puerto autorizado');
  });

  it('writes commands when connected', async () => {
    const writer = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn()
    };

    const port = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      writable: { getWriter: () => writer },
      readable: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true }),
          cancel: vi.fn(),
          releaseLock: vi.fn()
        })
      },
      addEventListener: vi.fn()
    };

    const manager = createSerialManager({ getPorts: vi.fn().mockResolvedValue([port]) });
    await manager.connect({ bootMs: 0 });
    await manager.writeCommand('active');

    expect(writer.write).toHaveBeenCalledWith(buildCommandBytes('active'));
  });
});
