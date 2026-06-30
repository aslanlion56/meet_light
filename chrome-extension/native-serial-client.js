import {
  NATIVE_CONNECT_TIMEOUT_MS,
  NATIVE_DEFAULT_TIMEOUT_MS
} from './constants.js';

export function createNativeSerialClient(chromeApi, hostName) {
  let nativePort = null;
  let requestId = 0;
  const pending = new Map();

  function formatNativeError(message) {
    if (!message) {
      return 'Host nativo desconectado.';
    }
    if (message.includes('Specified native messaging host not found')) {
      return (
        'Host nativo no instalado. Ejecuta scripts/install-native-host-macos.sh ' +
        '(o install-native-host-windows.ps1) y recarga la extensión.'
      );
    }
    return message;
  }

  function cleanupPending(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  function handleMessage(message) {
    if (!message || typeof message.id === 'undefined' || message.id === null) {
      return;
    }

    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    pending.delete(message.id);

    if (message.ok) {
      entry.resolve(message.result ?? {});
      return;
    }

    entry.reject(new Error(message.error || 'Error en host nativo.'));
  }

  function handleDisconnect() {
    const lastError = chromeApi.runtime.lastError;
    nativePort = null;
    cleanupPending(new Error(formatNativeError(lastError?.message)));
  }

  function ensurePort() {
    if (nativePort) {
      return nativePort;
    }

    nativePort = chromeApi.runtime.connectNative(hostName);
    if (chromeApi.runtime.lastError) {
      const error = new Error(formatNativeError(chromeApi.runtime.lastError.message));
      nativePort = null;
      throw error;
    }
    nativePort.onMessage.addListener(handleMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);
    return nativePort;
  }

  function send(action, payload = {}, timeoutMs) {
    const resolvedTimeout =
      timeoutMs ??
      (action === 'connect' ? NATIVE_CONNECT_TIMEOUT_MS : NATIVE_DEFAULT_TIMEOUT_MS);

    let port;
    try {
      port = ensurePort();
    } catch (error) {
      return Promise.reject(error);
    }

    const id = ++requestId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Tiempo agotado para acción: ${action}`));
      }, resolvedTimeout);

      pending.set(id, { resolve, reject, timer });

      try {
        port.postMessage({ id, action, payload });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  function disconnect() {
    if (!nativePort) {
      return;
    }
    nativePort.disconnect();
    nativePort = null;
  }

  return {
    send,
    disconnect
  };
}
