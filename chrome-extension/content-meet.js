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

  function hasLeaveCallButton() {
    const selectors = [
      '[aria-label*="Leave call"]',
      '[aria-label*="Salir de la llamada"]',
      '[aria-label*="Abandonar la llamada"]',
      '[data-tooltip*="Leave call"]',
      '[data-tooltip*="Salir de la llamada"]',
      'button[aria-label*="Leave"]',
      'button[aria-label*="Salir"]'
    ];

    for (const selector of selectors) {
      if (findVisible(selector)) return true;
    }

    const buttons = document.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
    for (const button of buttons) {
      const label = (button.getAttribute('aria-label') || '').toLowerCase();
      if (
        isVisible(button) &&
        (label.includes('leave call') ||
          label.includes('salir de la llamada') ||
          label.includes('abandonar la llamada'))
      ) {
        return true;
      }
    }

    return false;
  }

  function isInLobbyOrPreJoin() {
    const joinSelectors = [
      '[aria-label*="Join now"]',
      '[aria-label*="Unirse ahora"]',
      '[aria-label*="Ask to join"]',
      '[aria-label*="Solicitar unirse"]',
      '[data-tooltip*="Join now"]',
      '[data-tooltip*="Unirse ahora"]'
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
          label.includes('ask to join') ||
          label.includes('solicitar unirse'))
      ) {
        return true;
      }
    }

    return false;
  }

  function isInActiveMeeting() {
    return hasLeaveCallButton() && !isInLobbyOrPreJoin();
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

  // Meet no expone una API de integrantes: se leen del DOM. Los mosaicos de
  // video siempre están; el panel "Personas" (si está abierto) da la lista
  // completa en llamadas grandes.
  function collectParticipants() {
    const names = new Set();

    for (const item of document.querySelectorAll('[role="listitem"][aria-label]')) {
      if (item.hasAttribute('data-participant-id') || item.querySelector('[data-participant-id]')) {
        addName(names, item.getAttribute('aria-label'));
      }
    }

    for (const tile of document.querySelectorAll('[data-participant-id]')) {
      const selfName = tile.querySelector('[data-self-name]');
      if (selfName) {
        addName(names, selfName.getAttribute('data-self-name') || selfName.textContent);
        continue;
      }
      const label = tile.querySelector('.notranslate');
      if (label) addName(names, label.textContent);
    }

    return [...names];
  }

  function getMeetingCode() {
    const match = location.pathname.match(/^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})/i);
    return match ? match[1] : '';
  }

  function getMeetingTitle() {
    return document.title.replace(/^Meet\s*[-–:]\s*/i, '').trim();
  }

  const INFO_INTERVAL_MS = 5000;

  function reportInfo() {
    if (getMeetingStatus() !== 'active') return;

    try {
      chrome.runtime
        .sendMessage({
          type: 'MEETING_INFO',
          platform: 'meet',
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
        .sendMessage({ type: 'MEETING_STATE', status, platform: 'meet' })
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
    attributeFilter: ['aria-label', 'data-tooltip', 'style', 'class', 'hidden']
  });

  timers.push(setInterval(() => reportState(), 2000));
  timers.push(setInterval(() => reportState(true), INFO_INTERVAL_MS));
  reportState();
})();
