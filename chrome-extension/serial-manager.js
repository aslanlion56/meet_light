export const STATUS_COMMANDS = {
  free: 48,
  waiting: 49,
  active: 50
};

export const ARDUINO_BOOT_MS = 2500;
export const HEARTBEAT_MS = 1000;
export const RECONNECT_MS = 3000;

export function statusToCommand(status) {
  return STATUS_COMMANDS[status] ?? STATUS_COMMANDS.free;
}

export function buildCommandBytes(status) {
  const command = statusToCommand(status);
  return new Uint8Array([command, 10]);
}

export function createSerialManager(serialApi) {
  let port = null;
  let writer = null;
  let reader = null;
  let readLoopActive = false;
  let isConnecting = false;

  function isConnected() {
    return Boolean(writer && port);
  }

  async function closePort() {
    readLoopActive = false;

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Ignorar.
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignorar.
      }
      reader = null;
    }

    if (writer) {
      try {
        await writer.close();
      } catch {
        // Ignorar.
      }
      try {
        writer.releaseLock();
      } catch {
        // Ignorar.
      }
      writer = null;
    }

    if (port) {
      try {
        await port.close();
      } catch {
        // Ignorar.
      }
      port = null;
    }
  }

  function startInputDrain() {
    if (!port?.readable || reader) {
      return;
    }

    reader = port.readable.getReader();
    readLoopActive = true;

    (async () => {
      try {
        while (readLoopActive && port) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        // Ignorar.
      } finally {
        if (reader) {
          try {
            reader.releaseLock();
          } catch {
            // Ignorar.
          }
          reader = null;
        }
        readLoopActive = false;
      }
    })();
  }

  async function getGrantedPorts() {
    return serialApi.getPorts();
  }

  async function writeCommand(status) {
    if (!writer) {
      return false;
    }

    await writer.write(buildCommandBytes(status));
    return true;
  }

  async function connect(options = {}) {
    const { onDisconnect, bootMs = ARDUINO_BOOT_MS } = options;

    if (isConnected()) {
      const ports = await getGrantedPorts();
      return {
        ok: true,
        connected: true,
        portsFound: ports.length
      };
    }

    if (isConnecting) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (isConnected()) {
          const ports = await getGrantedPorts();
          return {
            ok: true,
            connected: true,
            portsFound: ports.length
          };
        }
        if (!isConnecting) {
          break;
        }
      }

      return {
        ok: false,
        connected: false,
        portsFound: 0,
        error: 'Tiempo de espera agotado.'
      };
    }

    isConnecting = true;

    try {
      const ports = await getGrantedPorts();
      if (ports.length === 0) {
        return {
          ok: false,
          connected: false,
          portsFound: 0,
          error: 'No hay puerto autorizado. Pulsa Conectar Arduino.'
        };
      }

      await closePort();

      const serialPort = ports[0];

      try {
        await serialPort.close();
      } catch {
        // El puerto puede no estar abierto todavía.
      }

      port = serialPort;
      await port.open({ baudRate: 9600 });
      writer = port.writable.getWriter();
      startInputDrain();

      if (onDisconnect) {
        port.addEventListener('disconnect', onDisconnect);
      }

      await new Promise((resolve) => setTimeout(resolve, bootMs));

      const portInfo = typeof port.getInfo === 'function' ? port.getInfo() : {};

      return {
        ok: true,
        connected: true,
        portsFound: ports.length,
        portInfo
      };
    } catch (error) {
      await closePort();
      const ports = await getGrantedPorts().catch(() => []);
      return {
        ok: false,
        connected: false,
        portsFound: ports.length,
        error: error.message
      };
    } finally {
      isConnecting = false;
    }
  }

  return {
    isConnected,
    closePort,
    getGrantedPorts,
    writeCommand,
    connect
  };
}
