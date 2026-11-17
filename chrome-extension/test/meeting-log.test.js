import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_SESSIONS_KEY,
  HISTORY_KEY,
  createMeetingLog,
  formatDuration,
  historyToCsv
} from '../meeting-log.js';

function createStorage() {
  const data = {};
  return {
    data,
    async get(keys) {
      return Object.fromEntries(
        keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])])
      );
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    }
  };
}

function setup(extra = {}) {
  const storageApi = createStorage();
  const clock = { value: 1_000_000 };
  const log = createMeetingLog({ storageApi, now: () => clock.value, ...extra });
  return { storageApi, clock, log };
}

describe('meeting-log', () => {
  it('records duration and participants when a session ends', async () => {
    const { log, clock } = setup();

    await log.trackSession(7, 'meet', { meetingCode: 'abc-defg-hij', participants: ['Ana'] });
    clock.value += 60_000;
    await log.trackSession(7, 'meet', { title: 'Daily', participants: ['Ana', 'Luis'] });
    clock.value += 30_000;
    const entry = await log.endSession(7);

    expect(entry).toMatchObject({
      platform: 'meet',
      meetingCode: 'abc-defg-hij',
      title: 'Daily',
      startedAt: 1_000_000,
      endedAt: 1_090_000,
      durationMs: 90_000
    });
    expect(entry.participants).toEqual([
      { name: 'Ana', firstSeenAt: 1_000_000, lastSeenAt: 1_060_000 },
      { name: 'Luis', firstSeenAt: 1_060_000, lastSeenAt: 1_060_000 }
    ]);
    expect(await log.getHistory()).toEqual([entry]);
    expect(await log.getActiveSessions()).toEqual([]);
  });

  it('keeps participants who left and dedupes names ignoring case and spaces', async () => {
    const { log } = setup();

    await log.trackSession(1, 'teams', { participants: ['Ana  López', 'Luis'] });
    await log.trackSession(1, 'teams', { participants: ['ana lópez', '', null] });
    const entry = await log.endSession(1);

    expect(entry.participants.map((participant) => participant.name)).toEqual([
      'Ana López',
      'Luis'
    ]);
  });

  it('does not restart a session that is already running', async () => {
    const { log, clock } = setup();

    await log.trackSession(1, 'meet');
    clock.value += 5_000;
    const session = await log.trackSession(1, 'meet');

    expect(session.startedAt).toBe(1_000_000);
  });

  it('ignores endSession for tabs without a session', async () => {
    const { log } = setup();
    expect(await log.endSession(99)).toBeNull();
    expect(await log.getHistory()).toEqual([]);
  });

  it('does not lose updates sent back to back', async () => {
    const { log } = setup();

    await Promise.all([
      log.trackSession(1, 'meet', { participants: ['Ana'] }),
      log.trackSession(2, 'teams', { participants: ['Luis'] }),
      log.trackSession(1, 'meet', { participants: ['Eva'] })
    ]);
    await Promise.all([log.endSession(1), log.endSession(2)]);

    const history = await log.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].participants.map((participant) => participant.name)).toEqual(['Ana', 'Eva']);
  });

  it('closes orphan sessions using the last time they were seen', async () => {
    const { log, clock, storageApi } = setup();

    await log.trackSession(1, 'meet');
    await log.trackSession(2, 'meet');
    clock.value += 20_000;
    await log.trackSession(1, 'meet', { participants: ['Ana'] });
    clock.value += 3_600_000;

    const closed = await log.closeOrphanSessions([2]);

    expect(closed).toHaveLength(1);
    expect(closed[0].durationMs).toBe(20_000);
    expect(Object.keys(storageApi.data[ACTIVE_SESSIONS_KEY])).toEqual(['2']);
    expect(storageApi.data[HISTORY_KEY]).toHaveLength(1);
  });

  it('notifies onSessionEnded and survives a failing sync', async () => {
    const onSessionEnded = vi.fn().mockRejectedValue(new Error('sin red'));
    const { log } = setup({ onSessionEnded });

    await log.trackSession(1, 'meet');
    const entry = await log.endSession(1);

    expect(onSessionEnded).toHaveBeenCalledWith(entry);
    expect(await log.getHistory()).toHaveLength(1);
  });

  it('formats durations and exports CSV safely', () => {
    expect(formatDuration(3_725_000)).toBe('01:02:05');

    const csv = historyToCsv([
      {
        startedAt: 0,
        endedAt: 90_000,
        durationMs: 90_000,
        platform: 'meet',
        title: 'Plan "Q4"',
        meetingCode: '',
        participants: [{ name: '=cmd()' }, { name: 'Ana' }]
      }
    ]);
    const [, row] = csv.split('\r\n');

    expect(row).toContain('"00:01:30"');
    expect(row).toContain('"Plan ""Q4"""');
    expect(row).toContain('"\'=cmd(); Ana"');
  });
});
