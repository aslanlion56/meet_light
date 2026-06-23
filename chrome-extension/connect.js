'use strict';

const connectBtn = document.getElementById('connect-btn');
const statusMsgEl = document.getElementById('status-msg');

function showStatus(message, type) {
  statusMsgEl.textContent = message;
  statusMsgEl.className = `status visible ${type}`;
}

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Esperando selección...';
  showStatus('Selecciona el puerto USB del Arduino en el diálogo del sistema.', 'info');

  try {
    // Sin filtros: muestra todos los puertos seriales (clones CH340, CP2102, etc.).
    await navigator.serial.requestPort();

    showStatus('Puerto seleccionado. Conectando...', 'info');

    const result = await chrome.runtime.sendMessage({
      type: 'CONNECT_ARDUINO',
      requestPort: false
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'No se pudo abrir el puerto serial.');
    }

    showStatus('¡Conectado! Ya puedes cerrar esta pestaña.', 'success');
    connectBtn.textContent = 'Conectado';
  } catch (error) {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Elegir puerto USB';

    if (error.name === 'NotFoundError') {
      showStatus(
        'No se seleccionó puerto. Pulsa de nuevo y elige el Arduino en la lista.',
        'error'
      );
    } else {
      showStatus(
        error.message || 'Error al conectar. Cierra Arduino IDE y Monitor Serial.',
        'error'
      );
    }

    console.error(error);
  }
});
