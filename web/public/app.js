import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  Timestamp,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Id fijo de la extensión (lo determina la "key" de su manifest). Va escrito
// aquí, y no en la URL, para que la sesión solo pueda entregarse a Meet Light.
const EXTENSION_ID = 'hgcljcenaadbkdbmfnhbdnaednbbijhi';
const PLATFORM_LABELS = { meet: 'Google Meet', teams: 'Microsoft Teams' };

const $ = (id) => document.getElementById(id);
const noticeEl = $('notice');
const fromEl = $('from');
const toEl = $('to');
const platformEl = $('platform');
const searchEl = $('search');

// Firebase Hosting sirve la configuración del proyecto en esta ruta.
const config = await (await fetch('/__/firebase/init.json')).json();
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const wantsLink = new URLSearchParams(location.search).has('vincular');
let meetings = [];
let visible = [];
let unsubscribe = null;

function showNotice(message, isError = false) {
  noticeEl.textContent = message;
  noticeEl.classList.toggle('error', isError);
  noticeEl.hidden = !message;
}

function formatDuration(durationMs) {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function millis(value, fallback) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : fallback;
}

function fromDoc(doc) {
  const data = doc.data();
  const startedAt = millis(data.startedAt, 0);
  const endedAt = millis(data.endedAt, startedAt);
  return {
    id: doc.id,
    platform: data.platform || '',
    title: data.title || data.meetingCode || '',
    startedAt,
    endedAt,
    durationMs: Number(data.durationMs ?? endedAt - startedAt),
    participants: (data.participants ?? []).map((participant) => ({
      name: participant.name,
      // Tiempo entre la primera y la última vez que se le vio en la llamada.
      presentMs: Math.max(
        0,
        millis(participant.lastSeenAt, startedAt) - millis(participant.firstSeenAt, startedAt)
      )
    }))
  };
}

/** Entrega la sesión a la extensión para que suba las juntas con esta cuenta. */
async function linkExtension(user) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    showNotice(
      'No se encontró la extensión Meet Light en este navegador. Instálala o recárgala y vuelve a pulsar "Vincular cuenta de Google" en su popup.',
      true
    );
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage(EXTENSION_ID, {
      type: 'LINK_ACCOUNT',
      refreshToken: user.refreshToken,
      uid: user.uid,
      email: user.email
    });
    if (!result?.ok) {
      throw new Error(result?.error || 'La extensión rechazó la vinculación.');
    }
    showNotice(`Extensión vinculada con ${user.email}. Las juntas se subirán al terminar cada llamada.`);
    history.replaceState(null, '', location.pathname);
  } catch (error) {
    showNotice(`No se pudo vincular la extensión: ${error.message}`, true);
  }
}

function applyFilters() {
  const platform = platformEl.value;
  const term = searchEl.value.trim().toLowerCase();

  visible = meetings.filter((meeting) => {
    if (platform && meeting.platform !== platform) return false;
    if (!term) return true;
    return (
      meeting.title.toLowerCase().includes(term) ||
      meeting.participants.some((participant) => participant.name.toLowerCase().includes(term))
    );
  });

  render();
}

function render() {
  const totalMs = visible.reduce((sum, meeting) => sum + meeting.durationMs, 0);
  const people = new Map();

  for (const meeting of visible) {
    for (const participant of meeting.participants) {
      const key = participant.name.toLowerCase();
      const entry = people.get(key) ?? { name: participant.name, meetings: 0, presentMs: 0 };
      entry.meetings += 1;
      entry.presentMs += participant.presentMs;
      people.set(key, entry);
    }
  }

  $('stat-count').textContent = String(visible.length);
  $('stat-total').textContent = formatDuration(totalMs);
  $('stat-average').textContent = formatDuration(visible.length ? totalMs / visible.length : 0);
  $('stat-people').textContent = String(people.size);

  $('empty').hidden = visible.length > 0;
  $('meetings-table').hidden = visible.length === 0;
  $('people-table').hidden = people.size === 0;
  $('export-btn').disabled = visible.length === 0;

  $('meetings-rows').replaceChildren(
    ...visible.map((meeting) => {
      const row = document.createElement('tr');
      const names = meeting.participants.map((participant) => participant.name);
      row.append(
        cell(new Date(meeting.startedAt).toLocaleString(), 'nowrap'),
        cell(formatDuration(meeting.durationMs), 'nowrap'),
        cell(PLATFORM_LABELS[meeting.platform] ?? (meeting.platform || '—'), 'nowrap'),
        cell(meeting.title || '—'),
        cell(
          names.length ? `(${names.length}) ${names.join(', ')}` : 'Sin datos',
          names.length ? '' : 'muted'
        )
      );
      return row;
    })
  );

  $('people-rows').replaceChildren(
    ...[...people.values()]
      .sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name))
      .map((person) => {
        const row = document.createElement('tr');
        row.append(
          cell(person.name),
          cell(String(person.meetings)),
          cell(formatDuration(person.presentMs), 'nowrap')
        );
        return row;
      })
  );
}

function subscribe() {
  unsubscribe?.();
  const user = auth.currentUser;
  if (!user || !fromEl.value || !toEl.value) return;

  const from = new Date(`${fromEl.value}T00:00:00`);
  const to = new Date(`${toEl.value}T23:59:59.999`);

  unsubscribe = onSnapshot(
    query(
      collection(db, 'users', user.uid, 'meetings'),
      where('startedAt', '>=', Timestamp.fromDate(from)),
      where('startedAt', '<=', Timestamp.fromDate(to)),
      orderBy('startedAt', 'desc')
    ),
    (snapshot) => {
      meetings = snapshot.docs.map(fromDoc);
      applyFilters();
    },
    (error) => showNotice(`No se pudieron cargar las juntas: ${error.message}`, true)
  );
}

function csvCell(value) {
  let text = String(value ?? '');
  // Evita que Excel/Sheets interpreten un nombre como fórmula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = [
    ['Inicio', 'Fin', 'Duración', 'Minutos', 'Plataforma', 'Junta', 'Integrantes', 'Nombres'],
    ...visible.map((meeting) => [
      new Date(meeting.startedAt).toLocaleString(),
      new Date(meeting.endedAt).toLocaleString(),
      formatDuration(meeting.durationMs),
      (meeting.durationMs / 60000).toFixed(1),
      PLATFORM_LABELS[meeting.platform] ?? meeting.platform,
      meeting.title,
      meeting.participants.length,
      meeting.participants.map((participant) => participant.name).join('; ')
    ])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `juntas-${fromEl.value}-a-${toEl.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Por defecto: últimos 30 días.
const today = new Date();
toEl.value = toDateInput(today);
fromEl.value = toDateInput(new Date(today.getTime() - 29 * 86400000));

fromEl.addEventListener('change', subscribe);
toEl.addEventListener('change', subscribe);
platformEl.addEventListener('change', applyFilters);
searchEl.addEventListener('input', applyFilters);
$('export-btn').addEventListener('click', exportCsv);
$('sign-out-btn').addEventListener('click', () => signOut(auth));
$('sign-in-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    showNotice(`No se pudo iniciar sesión: ${error.message}`, true);
  }
});

onAuthStateChanged(auth, (user) => {
  $('sign-in').hidden = Boolean(user);
  $('report').hidden = !user;
  $('account').hidden = !user;

  if (!user) {
    unsubscribe?.();
    unsubscribe = null;
    meetings = [];
    if (wantsLink) {
      showNotice('Inicia sesión con Google para vincular la extensión Meet Light.');
    }
    return;
  }

  $('account-email').textContent = user.email ?? '';
  subscribe();
  if (wantsLink && location.search.includes('vincular')) {
    linkExtension(user);
  }
});
