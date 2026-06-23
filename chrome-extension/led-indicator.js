'use strict';

function resolveLedMode(status, serialConnected) {
  if (!serialConnected) {
    return 'blink-blue';
  }

  if (status === 'active') {
    return 'red';
  }

  if (status === 'waiting') {
    return 'blue';
  }

  return 'green';
}

function ledLabel(status, serialConnected) {
  if (!serialConnected) {
    return 'Sin conexión serial (parpadeo azul)';
  }

  if (status === 'active') {
    return 'En junta (rojo)';
  }

  if (status === 'waiting') {
    return 'Esperando (azul)';
  }

  return 'Libre (verde)';
}

function updateLedIndicator(lampEl, labelEl, status, serialConnected) {
  if (!lampEl) {
    return;
  }

  const mode = resolveLedMode(status, serialConnected);
  lampEl.className = `led-lamp led-${mode}`;
  lampEl.setAttribute('aria-label', ledLabel(status, serialConnected));

  if (labelEl) {
    labelEl.textContent = ledLabel(status, serialConnected);
  }
}
