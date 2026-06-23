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

  function reportState() {
    const status = getMeetingStatus();
    if (status === lastState) return;

    lastState = status;
    chrome.runtime.sendMessage({
      type: 'MEETING_STATE',
      status,
      platform: 'meet'
    });
  }

  const observer = new MutationObserver(reportState);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-tooltip', 'style', 'class', 'hidden']
  });

  setInterval(reportState, 2000);
  reportState();
})();
