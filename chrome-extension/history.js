import {
  ACTIVE_SESSIONS_KEY,
  HISTORY_KEY,
  createMeetingLog,
  formatDuration,
  historyToCsv
} from './meeting-log.js';

const meetingLog = createMeetingLog({ storageApi: chrome.storage.local });

const summaryEl = document.getElementById('summary');
const emptyEl = document.getElementById('empty');
const tableEl = document.getElementById('table');
const rowsEl = document.getElementById('rows');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');

const PLATFORM_LABELS = { meet: 'Google Meet', teams: 'Microsoft Teams' };

let history = [];

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function participantsText(participants) {
  if (!participants?.length) return 'Sin datos';
  return `(${participants.length}) ${participants.map((entry) => entry.name).join(', ')}`;
}

function buildRow(entry, live) {
  const row = document.createElement('tr');
  const durationMs = live ? Date.now() - entry.startedAt : entry.durationMs;

  row.append(
    cell(new Date(entry.startedAt).toLocaleString(), 'nowrap'),
    cell(
      live ? `${formatDuration(durationMs)} · en curso` : formatDuration(durationMs),
      live ? 'nowrap live' : 'nowrap'
    ),
    cell(PLATFORM_LABELS[entry.platform] ?? entry.platform ?? '—', 'nowrap'),
    cell(entry.title || entry.meetingCode || '—'),
    cell(participantsText(entry.participants), entry.participants?.length ? '' : 'muted')
  );
  return row;
}

async function render() {
  history = await meetingLog.getHistory();
  const active = await meetingLog.getActiveSessions();

  const totalMs = history.reduce((sum, entry) => sum + entry.durationMs, 0);
  summaryEl.textContent =
    `${history.length} junta(s) registradas · tiempo total ${formatDuration(totalMs)}` +
    ` · ${history.filter((entry) => entry.syncedAt).length} en la nube`;

  const hasRows = history.length > 0 || active.length > 0;
  emptyEl.hidden = hasRows;
  tableEl.hidden = !hasRows;
  exportBtn.disabled = history.length === 0;
  clearBtn.disabled = history.length === 0;

  rowsEl.replaceChildren(
    ...active.map((entry) => buildRow(entry, true)),
    ...[...history].reverse().map((entry) => buildRow(entry, false))
  );
}

exportBtn.addEventListener('click', () => {
  // BOM para que Excel abra los acentos correctamente.
  const blob = new Blob(['﻿', historyToCsv(history)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `juntas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('¿Borrar todo el historial de juntas? Esta acción no se puede deshacer.')) {
    return;
  }
  await meetingLog.clearHistory();
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[HISTORY_KEY] || changes[ACTIVE_SESSIONS_KEY])) {
    render();
  }
});

render();
setInterval(render, 5000);
