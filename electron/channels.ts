export const CH = {
  version: 'pos:version',
  prefsGet: 'pos:prefs:get',
  prefsSet: 'pos:prefs:set',
  windowShow: 'pos:window:show',
  windowMinimizeToTray: 'pos:window:minimize-to-tray',
  windowSetFloating: 'pos:window:set-floating',
  authSave: 'pos:auth:save',
  authLoad: 'pos:auth:load',
  authClear: 'pos:auth:clear',
  notifyNewOrder: 'pos:notify:new-order',
  notificationClick: 'pos:notification:click',
  badgeSet: 'pos:badge:set',
  printTicket: 'pos:print:ticket',
  printListPrinters: 'pos:print:list-printers',
  outboxEnqueue: 'pos:outbox:enqueue',
  outboxList: 'pos:outbox:list',
  outboxUpdate: 'pos:outbox:update',
  outboxDelete: 'pos:outbox:delete',
  outboxSummary: 'pos:outbox:summary',
  outboxSummaryChanged: 'pos:outbox:summary-changed',
} as const;

export interface NotificationClickPayload {
  orderId: number;
}

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user_id?: string;
  email?: string | null;
}
