import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_KEY, SYNC_ERROR_KEY, createCloudSync } from '../cloud-sync.js';
import { createMeetingLog } from '../meeting-log.js';

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
    },
    async remove(keys) {
      for (const key of keys) delete data[key];
    }
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const ACCOUNT = { refreshToken: 'refresh-1', uid: 'user-1', email: 'ana@example.com' };

async function setup({ firestore = () => jsonResponse({}) } = {}) {
  const storageApi = createStorage();
  const clock = { value: 1_000_000 };
  const meetingLog = createMeetingLog({ storageApi, now: () => clock.value });
  const fetchFn = vi.fn(async (url, options) => {
    if (url.startsWith('https://securetoken.googleapis.com/')) {
      return jsonResponse({ id_token: 'id-token', user_id: 'user-1', expires_in: '3600' });
    }
    return firestore(url, options);
  });
  const cloudSync = createCloudSync({
    storageApi,
    meetingLog,
    config: { apiKey: 'key', projectId: 'demo' },
    fetchFn,
    now: () => clock.value
  });

  await meetingLog.trackSession(1, 'meet', { title: 'Daily', participants: ['Ana'] });
  clock.value += 60_000;
  const entry = await meetingLog.endSession(1);

  const firestoreCalls = () =>
    fetchFn.mock.calls.filter(([url]) => url.startsWith('https://firestore.googleapis.com/'));

  return { storageApi, meetingLog, cloudSync, fetchFn, entry, firestoreCalls };
}

describe('cloud-sync', () => {
  it('does nothing without a linked account', async () => {
    const { cloudSync, fetchFn } = await setup();

    expect(await cloudSync.syncPending()).toEqual({ linked: false, uploaded: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uploads pending meetings under the user and marks them synced', async () => {
    const { cloudSync, meetingLog, entry, firestoreCalls } = await setup();

    await cloudSync.linkAccount(ACCOUNT);
    expect(await cloudSync.syncPending()).toEqual({ linked: true, uploaded: 1 });

    const [[url, options]] = firestoreCalls();
    expect(url).toBe(
      'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents' +
        `/users/user-1/meetings/${entry.id}`
    );
    expect(options.method).toBe('PATCH');
    expect(options.headers.Authorization).toBe('Bearer id-token');

    const { fields } = JSON.parse(options.body);
    expect(fields.title).toEqual({ stringValue: 'Daily' });
    expect(fields.durationMs).toEqual({ integerValue: '60000' });
    expect(fields.startedAt).toEqual({ timestampValue: new Date(1_000_000).toISOString() });
    expect(fields.participants.arrayValue.values[0].mapValue.fields.name).toEqual({
      stringValue: 'Ana'
    });

    expect((await meetingLog.getHistory())[0].syncedAt).toBeTypeOf('number');

    // Ya sincronizada: no se vuelve a subir.
    expect(await cloudSync.syncPending()).toEqual({ linked: true, uploaded: 0 });
    expect(firestoreCalls()).toHaveLength(1);
    expect((await cloudSync.getStatus()).pending).toBe(0);
  });

  it('keeps meetings pending and records the error when the upload fails', async () => {
    const { cloudSync, storageApi, meetingLog } = await setup({
      firestore: () => jsonResponse({ error: { message: 'PERMISSION_DENIED' } }, false, 403)
    });

    await cloudSync.linkAccount(ACCOUNT);
    await expect(cloudSync.syncPending()).rejects.toThrow('PERMISSION_DENIED');

    expect(storageApi.data[SYNC_ERROR_KEY]).toBe('PERMISSION_DENIED');
    expect((await meetingLog.getHistory())[0].syncedAt).toBeUndefined();
    expect(await cloudSync.getStatus()).toMatchObject({
      linked: true,
      email: 'ana@example.com',
      pending: 1
    });
  });

  it('rejects a session that belongs to a different user', async () => {
    const { cloudSync, storageApi } = await setup();

    await expect(cloudSync.linkAccount({ ...ACCOUNT, uid: 'someone-else' })).rejects.toThrow(
      /no corresponde/
    );
    expect(storageApi.data[ACCOUNT_KEY]).toBeUndefined();
  });

  it('rejects incomplete account data', async () => {
    const { cloudSync } = await setup();
    await expect(cloudSync.linkAccount({ uid: 'user-1' })).rejects.toThrow(/incompletos/);
  });
});
