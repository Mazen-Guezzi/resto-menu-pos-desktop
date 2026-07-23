import { contextBridge, ipcRenderer } from 'electron';
import { CH, type StoredSession, type NotificationClickPayload } from './channels';
import type { Prefs } from './prefs';

const api = {
  version: (): Promise<{ app: string; electron: string; os: string }> =>
    ipcRenderer.invoke(CH.version),

  prefs: {
    get: <K extends keyof Prefs>(key: K): Promise<Prefs[K]> =>
      ipcRenderer.invoke(CH.prefsGet, key),
    set: <K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<boolean> =>
      ipcRenderer.invoke(CH.prefsSet, key, value),
  },

  window: {
    show: (): Promise<void> => ipcRenderer.invoke(CH.windowShow),
    minimizeToTray: (): Promise<void> => ipcRenderer.invoke(CH.windowMinimizeToTray),
    setFloating: (on: boolean): Promise<void> => ipcRenderer.invoke(CH.windowSetFloating, on),
  },

  auth: {
    save: (session: StoredSession): Promise<boolean> => ipcRenderer.invoke(CH.authSave, session),
    load: (): Promise<StoredSession | null> => ipcRenderer.invoke(CH.authLoad),
    clear: (): Promise<boolean> => ipcRenderer.invoke(CH.authClear),
  },

  notify: {
    newOrder: (payload: { orderId: number; title: string; body: string }): Promise<void> =>
      ipcRenderer.invoke(CH.notifyNewOrder, payload),
    onClick: (cb: (payload: NotificationClickPayload) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: NotificationClickPayload) =>
        cb(payload);
      ipcRenderer.on(CH.notificationClick, listener);
      return () => ipcRenderer.removeListener(CH.notificationClick, listener);
    },
  },

  badge: {
    set: (pending: number): Promise<void> => ipcRenderer.invoke(CH.badgeSet, pending),
  },

  print: {
    ticket: (args: { html: string; deviceName?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(CH.printTicket, args),
    listPrinters: (): Promise<
      Array<{ name: string; displayName: string; description: string; isDefault: boolean; status: number }>
    > => ipcRenderer.invoke(CH.printListPrinters),
    listUsb: (): Promise<
      Array<{ vendorId: number; productId: number; manufacturer?: string; product?: string; serial?: string }>
    > => ipcRenderer.invoke(CH.printListUsb),
    order: (args: {
      order: unknown;
      mode: 'kitchen' | 'customer' | 'both';
      html?: { kitchen?: string; customer?: string };
    }): Promise<{ ok: boolean; errors: string[] }> => ipcRenderer.invoke(CH.printOrder, args),
    testConfig: (args: {
      config: unknown;
      kind: 'kitchen' | 'customer';
    }): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(CH.printTestConfig, args),
  },

  outbox: {
    enqueue: (args: { op: string; payload: unknown; localId?: string }): Promise<unknown> =>
      ipcRenderer.invoke(CH.outboxEnqueue, args),
    list: (): Promise<unknown[]> => ipcRenderer.invoke(CH.outboxList),
    update: (localId: string, patch: unknown): Promise<unknown> =>
      ipcRenderer.invoke(CH.outboxUpdate, localId, patch),
    delete: (localId: string): Promise<boolean> => ipcRenderer.invoke(CH.outboxDelete, localId),
    summary: (): Promise<{ pending: number; inFlight: number; errors: number; total: number }> =>
      ipcRenderer.invoke(CH.outboxSummary),
    onSummaryChanged: (
      cb: (s: { pending: number; inFlight: number; errors: number; total: number }) => void,
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        s: { pending: number; inFlight: number; errors: number; total: number },
      ) => cb(s);
      ipcRenderer.on(CH.outboxSummaryChanged, listener);
      return () => ipcRenderer.removeListener(CH.outboxSummaryChanged, listener);
    },
  },
};

contextBridge.exposeInMainWorld('pos', api);

export type PosApi = typeof api;
export type { StoredSession };
