(function () {
  'use strict';

  let lastState = null;

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetParent !== null
    );
  }

  function findVisible(selector) {
    for (const element of document.querySelectorAll(selector)) {
      if (isVisible(element)) return element;
    }
    return null;
  }

  function hasHangUpButton() {
    const selectors = [
      '[data-tid="hangup-main-btn"]',
      '[data-tid="call-hangup"]',
      'button[id*="hangup"]',
      '[aria-label*="Hang up"]',
      '[aria-label*="Leave"]',
      '[aria-label*="Colgar"]',
      '[aria-label*="Salir"]',
      '[aria-label*="Abandonar"]'
    ];

    for (const selector of selectors) {
      if (findVisible(selector)) return true;
    }

    const buttons = document.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
    for (const button of buttons) {
      const label = (button.getAttribute('aria-label') || '').toLowerCase();
      if (
        isVisible(button) &&
        (label.includes('hang up') ||
          label.includes('leave') ||
          label.includes('colgar') ||
          label.includes('salir') ||
          label.includes('abandonar'))
      ) {
        return true;
      }
    }

    return false;
  }

  function isInPreJoin() {
    const joinSelectors = [
      '[data-tid="prejoin-join-button"]',
      '[data-tid="join-button"]',
      '[aria-label*="Join now"]',
      '[aria-label*="Unirse ahora"]',
      '[aria-label*="Join meeting"]',
      '[aria-label*="Unirse a la reunión"]'
    ];

    for (const selector of joinSelectors) {
      if (findVisible(selector)) return true;
    }

    const buttons = document.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
    for (const button of buttons) {
      const label = (button.getAttribute('aria-label') || '').toLowerCase();
      if (
        isVisible(button) &&
        (label.includes('join now') ||
          label.includes('unirse ahora') ||
          label.includes('join meeting') ||
          label.includes('unirse a la reunión'))
      ) {
        return true;
      }
    }

    return false;
  }

  function isInActiveMeeting() {
    return hasHangUpButton() && !isInPreJoin();
  }

  function getMeetingStatus() {
    if (isInActiveMeeting()) return 'active';
    return 'waiting';
  }

  function addName(names, raw) {
    const name = (raw || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 120) return;
    names.add(name);
  }

  // Teams no expone una API de integrantes: se leen del DOM. El panel
  // "Personas" (si está abierto) da la lista completa; si no, se usan los
  // mosaicos de video visibles.
  function collectParticipants() {
    const names = new Set();

    for (const item of document.querySelectorAll('[data-tid^="participantsInCall-"]')) {
      addName(names, item.getAttribute('data-tid').slice('participantsInCall-'.length));
    }

    for (const item of document.querySelectorAll('[data-cid="roster-participant"]')) {
      addName(names, (item.getAttribute('aria-label') || '').split(',')[0]);
    }

    for (const tile of document.querySelectorAll('[data-cid="calling-participant-stream"]')) {
      addName(names, (tile.getAttribute('aria-label') || '').split(',')[0]);
    }

    return [...names];
  }

  function getMeetingCode() {
    return '';
  }

  function getMeetingTitle() {
    return document.title.replace(/\s*\|\s*Microsoft Teams.*$/i, '').trim();
  }

  const INFO_INTERVAL_MS = 5000;

  function reportInfo() {
    if (getMeetingStatus() !== 'active') return;

    try {
      chrome.runtime
        .sendMessage({
          type: 'MEETING_INFO',
          platform: 'teams',
          title: getMeetingTitle(),
          meetingCode: getMeetingCode(),
          participants: collectParticipants()
        })
        .catch(() => {});
    } catch {
      // Extensión recargada: este content script quedó huérfano.
    }
  }

  // `force` reenvía el estado aunque no haya cambiado: si el service worker se
  // reinició, así recupera qué pestañas hay y en qué estado están.
  function reportState(force = false) {
    if (!chrome.runtime?.id) {
      // La extensión se recargó y este script quedó huérfano: se apaga.
      observer.disconnect();
      timers.forEach(clearInterval);
      return;
    }

    const status = getMeetingStatus();
    if (!force && status === lastState) return;

    lastState = status;
    try {
      chrome.runtime
        .sendMessage({ type: 'MEETING_STATE', status, platform: 'teams' })
        .catch(() => {});
    } catch {
      return;
    }
    reportInfo();
  }

  const timers = [];
  const observer = new MutationObserver(() => reportState());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-tid', 'style', 'class', 'hidden']
  });

  timers.push(setInterval(() => reportState(), 2000));
  timers.push(setInterval(() => reportState(true), INFO_INTERVAL_MS));
  reportState();
})();
