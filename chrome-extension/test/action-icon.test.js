import { describe, expect, it, vi } from 'vitest';
import { LED_COLORS, createActionIcon, resolveIconState } from '../action-icon.js';

describe('action-icon', () => {
  it('maps LED status to the same colors as the physical LED', () => {
    expect(resolveIconState('free', true)).toBe('free');
    expect(resolveIconState('waiting', true)).toBe('waiting');
    expect(resolveIconState('active', true)).toBe('active');
    expect(resolveIconState('active', false)).toBe('disconnected');
    expect(resolveIconState('unknown', true)).toBe('free');
  });

  it('repaints only when the state changes', () => {
    const chromeApi = { action: { setIcon: vi.fn(), setTitle: vi.fn() } };
    const draw = vi.fn((size, color) => ({ size, color }));
    const icon = createActionIcon(chromeApi, draw);

    icon.update('waiting', true);
    icon.update('waiting', true);
    expect(chromeApi.action.setIcon).toHaveBeenCalledTimes(1);
    expect(chromeApi.action.setIcon.mock.calls[0][0].imageData[16]).toEqual({
      size: 16,
      color: LED_COLORS.waiting
    });

    icon.update('free', true);
    expect(chromeApi.action.setIcon).toHaveBeenCalledTimes(2);
    expect(chromeApi.action.setTitle).toHaveBeenLastCalledWith({
      title: 'Meet Light — Libre (verde)'
    });
  });
});
