import { describe, expect, it } from 'vitest';
import {
  assertAuthorized,
  canAccessSerialActions,
  canReportMeetingState
} from '../message-auth.js';

describe('message-auth', () => {
  const chromeApi = { runtime: { id: 'abcdefghijklmnopabcdefghijklmnop' } };

  it('allows extension pages to access serial actions', () => {
    const sender = {
      id: chromeApi.runtime.id,
      url: `chrome-extension://${chromeApi.runtime.id}/popup.html`
    };
    expect(canAccessSerialActions(sender, chromeApi)).toBe(true);
    expect(() => assertAuthorized('GET_STATUS', sender, chromeApi)).not.toThrow();
  });

  it('blocks content scripts from serial actions', () => {
    const sender = {
      id: chromeApi.runtime.id,
      tab: { url: 'https://meet.google.com/abc-defg-hij' }
    };
    expect(canReportMeetingState(sender)).toBe(true);
    expect(canAccessSerialActions(sender, chromeApi)).toBe(false);
    expect(() => assertAuthorized('MANUAL_LED', sender, chromeApi)).toThrow(
      /Acción serial no permitida/
    );
  });

  it('allows popup sender without tab url', () => {
    const sender = { id: chromeApi.runtime.id };
    expect(canAccessSerialActions(sender, chromeApi)).toBe(true);
  });
});
