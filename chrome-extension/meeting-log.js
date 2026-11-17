export const HISTORY_KEY = 'meetingHistory';
export const ACTIVE_SESSIONS_KEY = 'meetingActiveSessions';
export const MAX_HISTORY_ENTRIES = 1000;
export const MAX_PARTICIPANTS = 500;
const MAX_NAME_LENGTH = 120;

function cleanText(value, maxLength = MAX_NAME_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function mergeParticipants(existing, names, timestamp) {
  const byKey = new Map(existing.map((entry) => [entry.name.toLowerCase(), entry]));

  for (const rawName of Array.isArray(names) ? names : []) {
    const name = cleanText(rawName);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    const known = byKey.get(key);
    if (known) {
      known.lastSeenAt = timestamp;
      continue;
    }
    if (byKey.size >= MAX_PARTICIPANTS) {
      break;
    }
    byKey.set(key, { name, firstSeenAt: timestamp, lastSeenAt: timestamp });
  }

  return [...byKey.values()];
}

/**
 * Registra las juntas (inicio, fin, duración e integrantes) por pestaña.
 *
 * La sesión en curso se guarda en storage en cada cambio porque el service
 * worker de MV3 puede reiniciarse a mitad de una llamada.
 *
 * `onSessionEnded(entry)` es el punto de enganche para sincronizar con un
 * backend remoto (Firestore, Sheets, etc.) sin tocar el resto del código.
 */
export function createMeetingLog({ storageApi, now = () => Date.now(), onSessionEnded }) {
  let queue = Promise.resolve();

  // Serializa los read-modify-write para que dos mensajes seguidos no se pisen.
  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function readState() {
    const data = await storageApi.get([HISTORY_KEY, ACTIVE_SESSIONS_KEY]);
    return {
      history: Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [],
      active: data[ACTIVE_SESSIONS_KEY] ?? {}
    };
  }

  function buildEntry(session, endedAt) {
    const finalEnd = Math.max(endedAt, session.startedAt);
    return {
      id: session.id,
      platform: session.platform,
      meetingCode: session.meetingCode,
      title: session.title,
      startedAt: session.startedAt,
      endedAt: finalEnd,
      durationMs: finalEnd - session.startedAt,
      participants: session.participants
    };
  }

  async function notifyEnded(entries) {
    if (!onSessionEnded) {
      return;
    }
    for (const entry of entries) {
      try {
        await onSessionEnded(entry);
      } catch {
        // La sincronización remota no debe romper el registro local.
      }
    }
  }

  function applyInfo(session, info, timestamp) {
    const title = cleanText(info.title, 200);
    const meetingCode = cleanText(info.meetingCode, 200);
    if (title) session.title = title;
    if (meetingCode) session.meetingCode = meetingCode;
    session.participants = mergeParticipants(session.participants, info.participants, timestamp);
    session.lastSeenAt = timestamp;
  }

  /** Crea la sesión si no existe y actualiza título, código e integrantes. */
  function trackSession(tabId, platform, info = {}) {
    return enqueue(async () => {
      const { active } = await readState();
      const timestamp = now();
      const key = String(tabId);
      let session = active[key];

      if (!session) {
        session = {
          id: `${timestamp}-${key}`,
          tabId,
          platform: platform ?? null,
          meetingCode: '',
          title: '',
          startedAt: timestamp,
          lastSeenAt: timestamp,
          participants: []
        };
        active[key] = session;
      }

      applyInfo(session, info, timestamp);
      await storageApi.set({ [ACTIVE_SESSIONS_KEY]: active });
      return session;
    });
  }

  function endSession(tabId) {
    return enqueue(async () => {
      const { history, active } = await readState();
      const key = String(tabId);
      const session = active[key];
      if (!session) {
        return null;
      }

      delete active[key];
      const entry = buildEntry(session, now());
      const nextHistory = [...history, entry].slice(-MAX_HISTORY_ENTRIES);
      await storageApi.set({ [HISTORY_KEY]: nextHistory, [ACTIVE_SESSIONS_KEY]: active });
      await notifyEnded([entry]);
      return entry;
    });
  }

  /**
   * Cierra sesiones cuya pestaña ya no existe (p. ej. Chrome se cerró en plena
   * llamada). Se usa la última vez que se supo de la junta como hora de fin.
   */
  function closeOrphanSessions(openTabIds) {
    return enqueue(async () => {
      const { history, active } = await readState();
      const open = new Set([...openTabIds].map(String));
      const closed = [];

      for (const [key, session] of Object.entries(active)) {
        if (open.has(key)) {
          continue;
        }
        closed.push(buildEntry(session, session.lastSeenAt ?? session.startedAt));
        delete active[key];
      }

      if (closed.length === 0) {
        return closed;
      }

      const nextHistory = [...history, ...closed].slice(-MAX_HISTORY_ENTRIES);
      await storageApi.set({ [HISTORY_KEY]: nextHistory, [ACTIVE_SESSIONS_KEY]: active });
      await notifyEnded(closed);
      return closed;
    });
  }

  async function getHistory() {
    return (await readState()).history;
  }

  async function getActiveSessions() {
    return Object.values((await readState()).active);
  }

  function markSynced(ids) {
    return enqueue(async () => {
      const { history } = await readState();
      const synced = new Set(ids);
      const timestamp = now();
      const nextHistory = history.map((entry) =>
        synced.has(entry.id) ? { ...entry, syncedAt: timestamp } : entry
      );
      await storageApi.set({ [HISTORY_KEY]: nextHistory });
    });
  }

  function clearHistory() {
    return enqueue(() => storageApi.set({ [HISTORY_KEY]: [] }));
  }

  return {
    trackSession,
    endSession,
    closeOrphanSessions,
    getHistory,
    getActiveSessions,
    markSynced,
    clearHistory
  };
}

export function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function csvCell(value) {
  let text = String(value ?? '');
  // Evita que Excel/Sheets interpreten un nombre como fórmula.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function historyToCsv(history) {
  const header = ['Inicio', 'Fin', 'Duración', 'Minutos', 'Plataforma', 'Junta', 'Integrantes', 'Nombres'];
  const rows = history.map((entry) => [
    new Date(entry.startedAt).toISOString(),
    new Date(entry.endedAt).toISOString(),
    formatDuration(entry.durationMs),
    (entry.durationMs / 60000).toFixed(1),
    entry.platform ?? '',
    entry.title || entry.meetingCode || '',
    entry.participants.length,
    entry.participants.map((participant) => participant.name).join('; ')
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
