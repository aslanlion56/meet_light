export const ACCOUNT_KEY = 'cloudAccount';
export const SYNC_ERROR_KEY = 'cloudSyncError';

const TOKEN_MARGIN_MS = 60_000;

function timestamp(ms) {
  return { timestampValue: new Date(ms).toISOString() };
}

/** Convierte una junta del historial local al formato de la API REST de Firestore. */
export function meetingToFirestoreFields(entry) {
  return {
    platform: { stringValue: entry.platform ?? '' },
    meetingCode: { stringValue: entry.meetingCode ?? '' },
    title: { stringValue: entry.title ?? '' },
    startedAt: timestamp(entry.startedAt),
    endedAt: timestamp(entry.endedAt),
    durationMs: { integerValue: String(Math.round(entry.durationMs)) },
    participants: {
      arrayValue: {
        values: (entry.participants ?? []).map((participant) => ({
          mapValue: {
            fields: {
              name: { stringValue: participant.name },
              firstSeenAt: timestamp(participant.firstSeenAt),
              lastSeenAt: timestamp(participant.lastSeenAt)
            }
          }
        }))
      }
    }
  };
}

/**
 * Sube las juntas terminadas a Firestore (users/{uid}/meetings/{id}) usando
 * solo fetch, sin el SDK de Firebase, para no necesitar empaquetador.
 *
 * La cuenta llega desde la página de reportes: ahí se inicia sesión con Google
 * y la página le entrega a la extensión el refresh token de Firebase Auth.
 */
export function createCloudSync({
  storageApi,
  meetingLog,
  config,
  fetchFn = (...args) => fetch(...args),
  now = () => Date.now()
}) {
  let cachedToken = null;
  let syncInFlight = null;

  async function getAccount() {
    const data = await storageApi.get([ACCOUNT_KEY]);
    return data[ACCOUNT_KEY] ?? null;
  }

  async function getStatus() {
    const data = await storageApi.get([ACCOUNT_KEY, SYNC_ERROR_KEY]);
    const account = data[ACCOUNT_KEY] ?? null;
    const pending = (await meetingLog.getHistory()).filter((entry) => !entry.syncedAt).length;
    return {
      linked: Boolean(account),
      email: account?.email ?? '',
      pending,
      lastError: data[SYNC_ERROR_KEY] ?? ''
    };
  }

  async function linkAccount({ refreshToken, uid, email }) {
    if (typeof refreshToken !== 'string' || !refreshToken || typeof uid !== 'string' || !uid) {
      throw new Error('Datos de cuenta incompletos.');
    }
    cachedToken = null;
    await storageApi.set({
      [ACCOUNT_KEY]: { refreshToken, uid, email: typeof email === 'string' ? email : '' },
      [SYNC_ERROR_KEY]: ''
    });
    // Valida el token antes de dar la cuenta por vinculada.
    try {
      await getIdToken();
    } catch (error) {
      await unlinkAccount();
      throw error;
    }
  }

  async function unlinkAccount() {
    cachedToken = null;
    await storageApi.remove([ACCOUNT_KEY, SYNC_ERROR_KEY]);
  }

  async function getIdToken() {
    const account = await getAccount();
    if (!account) {
      throw new Error('Sin cuenta vinculada.');
    }
    if (cachedToken && cachedToken.uid === account.uid && cachedToken.expiresAt > now()) {
      return cachedToken;
    }

    const response = await fetchFn(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refreshToken
        })
      }
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = body?.error?.message || `HTTP ${response.status}`;
      if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN/.test(code)) {
        await unlinkAccount();
        throw new Error('La sesión caducó. Vuelve a vincular la cuenta.');
      }
      throw new Error(`No se pudo renovar la sesión (${code}).`);
    }

    if (body.user_id !== account.uid) {
      await unlinkAccount();
      throw new Error('La sesión no corresponde a la cuenta vinculada.');
    }

    if (body.refresh_token && body.refresh_token !== account.refreshToken) {
      await storageApi.set({ [ACCOUNT_KEY]: { ...account, refreshToken: body.refresh_token } });
    }

    cachedToken = {
      uid: account.uid,
      idToken: body.id_token,
      expiresAt: now() + Number(body.expires_in ?? 3600) * 1000 - TOKEN_MARGIN_MS
    };
    return cachedToken;
  }

  async function uploadMeeting(entry, token) {
    const url =
      `https://firestore.googleapis.com/v1/projects/${config.projectId}` +
      `/databases/(default)/documents/users/${encodeURIComponent(token.uid)}` +
      `/meetings/${encodeURIComponent(entry.id)}`;

    // PATCH con el id de la junta: reintentar no duplica documentos.
    const response = await fetchFn(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: meetingToFirestoreFields(entry) })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Firestore respondió HTTP ${response.status}`);
    }
  }

  /** Sube todas las juntas del historial que aún no están en la nube. */
  function syncPending() {
    if (syncInFlight) {
      return syncInFlight;
    }

    syncInFlight = (async () => {
      if (!(await getAccount())) {
        return { linked: false, uploaded: 0 };
      }

      const pending = (await meetingLog.getHistory()).filter((entry) => !entry.syncedAt);
      const uploadedIds = [];

      try {
        if (pending.length > 0) {
          const token = await getIdToken();
          for (const entry of pending) {
            await uploadMeeting(entry, token);
            uploadedIds.push(entry.id);
          }
        }
        await storageApi.set({ [SYNC_ERROR_KEY]: '' });
        return { linked: true, uploaded: uploadedIds.length };
      } catch (error) {
        await storageApi.set({ [SYNC_ERROR_KEY]: error.message });
        throw error;
      } finally {
        if (uploadedIds.length > 0) {
          await meetingLog.markSynced(uploadedIds);
        }
      }
    })();

    const run = syncInFlight;
    run.then(
      () => (syncInFlight = null),
      () => (syncInFlight = null)
    );
    return run;
  }

  return {
    getStatus,
    linkAccount,
    unlinkAccount,
    syncPending
  };
}
