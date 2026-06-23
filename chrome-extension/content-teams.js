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

  function reportState() {
    const status = getMeetingStatus();
    if (status === lastState) return;

    lastState = status;
    chrome.runtime.sendMessage({
      type: 'MEETING_STATE',
      status,
      platform: 'teams'
    });
  }

  const observer = new MutationObserver(reportState);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-tid', 'style', 'class', 'hidden']
  });

  setInterval(reportState, 2000);
  reportState();
})();
