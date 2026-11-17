const ICON_SIZES = [16, 32, 48];

export const LED_COLORS = {
  free: '#22c55e',
  waiting: '#2563eb',
  active: '#ef4444',
  disconnected: '#9ca3af'
};

const TITLES = {
  free: 'Meet Light — Libre (verde)',
  waiting: 'Meet Light — Esperando (azul)',
  active: 'Meet Light — En junta (rojo)',
  disconnected: 'Meet Light — Arduino sin conexión'
};

export function resolveIconState(ledStatus, serialConnected) {
  if (!serialConnected) {
    return 'disconnected';
  }
  return ledStatus in LED_COLORS ? ledStatus : 'free';
}

function drawIcon(size, color) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  const radius = size * 0.22;

  context.fillStyle = '#111827';
  context.beginPath();
  context.roundRect(0, 0, size, size, radius);
  context.fill();

  context.fillStyle = color;
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  context.fill();

  return context.getImageData(0, 0, size, size);
}

/** Pinta el icono de la barra de Chrome con el mismo color que el LED físico. */
export function createActionIcon(chromeApi, draw = drawIcon) {
  let lastState = null;

  function update(ledStatus, serialConnected) {
    const state = resolveIconState(ledStatus, serialConnected);
    if (state === lastState) {
      return state;
    }
    lastState = state;

    const imageData = Object.fromEntries(
      ICON_SIZES.map((size) => [size, draw(size, LED_COLORS[state])])
    );
    chromeApi.action.setIcon({ imageData });
    chromeApi.action.setTitle({ title: TITLES[state] });
    return state;
  }

  return { update };
}
