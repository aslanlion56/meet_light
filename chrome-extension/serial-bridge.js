import {
  HEARTBEAT_MS,
  NATIVE_CONNECT_TIMEOUT_MS,
  NATIVE_DEFAULT_TIMEOUT_MS,
  NATIVE_STATUS_TIMEOUT_MS,
  STALE_HEARTBEAT_MS
} from './constants.js';

export function createSerialBridge({ nativeSerial, storage, onBadgeChange }) {
  let serialConnected = false;
  let manualOverride = false;
  let currentLedStatus = 'free';
  let globalStatus = 'free';
  let reconnectInFlight = null;
  let heartbeatTimer = null;

  function resolveLedStatus() {
    return manualOverride ? currentLedStatus : globalStatus;
  }

  function stopHeartbeatLoop() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function applySerialOutcome({ connected, portsFound, lastError, lastHeartbeatAt, portInfo }) {
    serialConnected = connected;
    await storage.persistSerialStatus(connected, connected ? 'connected' : 'disconnected', {
      portsFound,
      lastError: lastError ?? '',
      lastHeartbeatAt: lastHeartbeatAt ?? null,
      portInfo
    });
    onBadgeChange(connected, portsFound ?? 0);
  }

  function startHeartbeatLoop() {
    stopHeartbeatLoop();
    heartbeatTimer = setInterval(async () => {
      try {
        const result = await nativeSerial.send(
          'set_color',
          { status: resolveLedStatus() },
          NATIVE_DEFAULT_TIMEOUT_MS
        );
        serialConnected = Boolean(result?.connected ?? true);
        await storage.persistDiagnostics({
          lastHeartbeatAt: result?.lastHeartbeatAt ?? Date.now(),
          lastError: ''
        });
        await storage.persistSerialStatus(true, 'connected', {
          lastHeartbeatAt: result?.lastHeartbeatAt ?? Date.now()
        });
      } catch (error) {
        serialConnected = false;
        stopHeartbeatLoop();
        await storage.persistSerialStatus(false, 'disconnected', {
          lastError: error.message
        });
        onBadgeChange(false, 0);
      }
    }, HEARTBEAT_MS);
  }

  async function sendLedState(status) {
    currentLedStatus = status;
    try {
      const result = await nativeSerial.send('set_color', { status });
      serialConnected = true;
      await storage.persistDiagnostics({
        lastHeartbeatAt: result?.lastHeartbeatAt ?? Date.now(),
        lastError: ''
      });
      startHeartbeatLoop();
    } catch (error) {
      serialConnected = false;
      stopHeartbeatLoop();
      await storage.persistSerialStatus(false, 'disconnected', { lastError: error.message });
      onBadgeChange(false, 0);
    }
  }

  async function getStatusWithLiveSerial(meetingStatus, meetingPlatform) {
    const data = await storage.getAll();
    try {
      const native = await nativeSerial.send('status', {}, NATIVE_STATUS_TIMEOUT_MS);
      let liveConnected = Boolean(native.connected);
      const portsFound = Number(native.portsFound ?? 0);
      const heartbeatAge = native.lastHeartbeatAt
        ? Date.now() - native.lastHeartbeatAt
        : Number.POSITIVE_INFINITY;

      let statusError = native.lastError ?? data.lastError ?? '';
      if (liveConnected && heartbeatAge > STALE_HEARTBEAT_MS) {
        liveConnected = false;
        statusError = 'Heartbeat expirado; reconecta el Arduino.';
      }

      const connectionState = liveConnected
        ? 'connected'
        : data.serialConnectionState === 'connecting'
          ? 'connecting'
          : 'disconnected';

      serialConnected = liveConnected;
      if (!liveConnected) {
        stopHeartbeatLoop();
      }

      await storage.persistSerialStatus(liveConnected, connectionState, {
        portsFound,
        lastError: liveConnected ? native.lastError ?? '' : statusError,
        lastHeartbeatAt: native.lastHeartbeatAt ?? data.lastHeartbeatAt ?? null,
        portInfo: native.portInfo ?? data.portInfo
      });

      return {
        ...data,
        status: meetingStatus ?? data.status,
        platform: meetingStatus ? meetingPlatform : data.platform,
        ledStatus: resolveLedStatus(),
        manualOverride,
        serialConnected: liveConnected,
        serialConnectionState: connectionState,
        portsFound,
        portInfo: native.portInfo ?? data.portInfo,
        lastError: liveConnected ? native.lastError ?? '' : statusError,
        lastHeartbeatAt: native.lastHeartbeatAt ?? data.lastHeartbeatAt ?? null
      };
    } catch (error) {
      serialConnected = false;
      stopHeartbeatLoop();
      await storage.persistSerialStatus(false, 'disconnected', {
        lastError: error.message
      });
      onBadgeChange(false, 0);
      return {
        ...data,
        status: meetingStatus ?? data.status,
        platform: meetingStatus ? meetingPlatform : data.platform,
        ledStatus: resolveLedStatus(),
        manualOverride,
        serialConnected: false,
        serialConnectionState: 'disconnected',
        lastError: error.message,
        portsFound: Number(data.portsFound ?? 0)
      };
    }
  }

  async function attemptReconnect() {
    if (reconnectInFlight) {
      return reconnectInFlight;
    }

    reconnectInFlight = (async () => {
      await storage.persistSerialStatus(false, 'connecting');

      try {
        const current = await nativeSerial.send('status', {}, NATIVE_STATUS_TIMEOUT_MS);
        if (current?.connected) {
          serialConnected = true;
          await applySerialOutcome({
            connected: true,
            portsFound: Number(current.portsFound ?? 0),
            lastError: '',
            lastHeartbeatAt: current.lastHeartbeatAt ?? Date.now(),
            portInfo: current.portInfo
          });
          startHeartbeatLoop();
          return {
            ok: true,
            connected: true,
            portsFound: Number(current.portsFound ?? 0),
            portInfo: current.portInfo,
            skipped: true,
            reason: 'already_connected'
          };
        }

        const result = await nativeSerial.send(
          'connect',
          { status: globalStatus },
          NATIVE_CONNECT_TIMEOUT_MS
        );
        const connected = Boolean(result?.connected);
        const portsFound = Number(result?.portsFound ?? 0);

        if (connected) {
          serialConnected = true;
          currentLedStatus = globalStatus;
          await applySerialOutcome({
            connected: true,
            portsFound,
            lastError: '',
            lastHeartbeatAt: result?.lastHeartbeatAt ?? Date.now(),
            portInfo: result?.portInfo
          });
          startHeartbeatLoop();
          return { ok: true, connected: true, portsFound, portInfo: result?.portInfo };
        }

        stopHeartbeatLoop();
        await applySerialOutcome({
          connected: false,
          portsFound,
          lastError: result?.error || 'No se pudo conectar.'
        });
        return {
          ok: false,
          connected: false,
          portsFound,
          error: result?.error || 'No se pudo conectar.'
        };
      } catch (error) {
        const status = await getStatusWithLiveSerial(globalStatus, null);
        await applySerialOutcome({
          connected: false,
          portsFound: status?.portsFound ?? 0,
          lastError: error.message
        });
        return {
          ok: false,
          connected: false,
          portsFound: status?.portsFound ?? 0,
          error: error.message
        };
      }
    })();

    try {
      return await reconnectInFlight;
    } finally {
      reconnectInFlight = null;
    }
  }

  async function setManualColor(status) {
    manualOverride = true;
    currentLedStatus = status;
    const result = await nativeSerial.send('set_color', { status });
    serialConnected = true;
    await storage.persistSerialStatus(true, 'connected', {
      lastHeartbeatAt: result?.lastHeartbeatAt ?? Date.now(),
      lastError: ''
    });
    startHeartbeatLoop();
    return { ok: true, connected: true };
  }

  async function restoreAutomaticLed(sendMeetingState) {
    manualOverride = false;
    currentLedStatus = globalStatus;
    await sendMeetingState(true);
    return { ok: true };
  }

  function setGlobalStatus(status) {
    globalStatus = status;
  }

  function isSerialConnected() {
    return serialConnected;
  }

  async function bootstrap() {
    const status = await getStatusWithLiveSerial(globalStatus, null);
    onBadgeChange(Boolean(status.serialConnected), status.portsFound ?? 0);
    if (status.serialConnected) {
      startHeartbeatLoop();
      return status;
    }
    const result = await attemptReconnect();
    if (result.connected) {
      startHeartbeatLoop();
    }
    return result;
  }

  return {
    sendLedState,
    getStatusWithLiveSerial,
    attemptReconnect,
    setManualColor,
    restoreAutomaticLed,
    setGlobalStatus,
    isSerialConnected,
    getLedStatus: resolveLedStatus,
    bootstrap,
    stopHeartbeatLoop
  };
}
