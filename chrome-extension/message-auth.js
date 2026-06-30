import { MESSAGE_TYPES } from './message-types.js';

const MEETING_HOSTS = [
  /^https:\/\/meet\.google\.com\//,
  /^https:\/\/teams\.microsoft\.com\//,
  /^https:\/\/teams\.live\.com\//
];

const SERIAL_HOST_PAGE = /serial-host\.html(?:\?.*)?$/;

export function isExtensionSender(sender, chromeApi) {
  return sender?.id === chromeApi.runtime.id;
}

export function isContentScriptSender(sender) {
  const url = sender?.tab?.url || '';
  return MEETING_HOSTS.some((pattern) => pattern.test(url));
}

export function isSerialHostSender(sender, chromeApi) {
  if (!isExtensionSender(sender, chromeApi)) {
    return false;
  }
  const url = sender?.url || sender?.tab?.url || '';
  return SERIAL_HOST_PAGE.test(url);
}

export function canAccessSerialActions(sender, chromeApi) {
  if (!isExtensionSender(sender, chromeApi)) {
    return false;
  }
  return !isContentScriptSender(sender);
}

export function canReportMeetingState(sender) {
  return isContentScriptSender(sender);
}

export function canPinSerialTab(sender, chromeApi) {
  return isSerialHostSender(sender, chromeApi);
}

export function canHandleHostReady(sender, chromeApi) {
  return isSerialHostSender(sender, chromeApi);
}

export function assertAuthorized(type, sender, chromeApi) {
  if (type === MESSAGE_TYPES.MEETING_STATE) {
    if (!canReportMeetingState(sender)) {
      throw new Error('Remitente no autorizado para estado de reunión.');
    }
    return;
  }

  if (type === MESSAGE_TYPES.PIN_SERIAL_TAB) {
    if (!canPinSerialTab(sender, chromeApi)) {
      throw new Error('Solo la pestaña serial puede fijarse.');
    }
    return;
  }

  if (type === MESSAGE_TYPES.HOST_READY) {
    if (!canHandleHostReady(sender, chromeApi)) {
      throw new Error('HOST_READY ignorado.');
    }
    return;
  }

  if (
    type === MESSAGE_TYPES.RECONNECT ||
    type === MESSAGE_TYPES.GET_STATUS ||
    type === MESSAGE_TYPES.MANUAL_LED ||
    type === MESSAGE_TYPES.RESTORE_LED
  ) {
    if (!canAccessSerialActions(sender, chromeApi)) {
      throw new Error('Acción serial no permitida para este remitente.');
    }
  }
}
