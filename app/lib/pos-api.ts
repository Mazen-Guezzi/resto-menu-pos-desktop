export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user_id?: string;
  email?: string | null;
}

export interface PosApi {
  version: () => Promise<{ app: string; electron: string; os: string }>;
  prefs: {
    get: <T = unknown>(key: string) => Promise<T>;
    set: <T = unknown>(key: string, value: T) => Promise<boolean>;
  };
  window: {
    show: () => Promise<void>;
    minimizeToTray: () => Promise<void>;
    setFloating: (on: boolean) => Promise<void>;
  };
  auth: {
    save: (session: StoredSession) => Promise<boolean>;
    load: () => Promise<StoredSession | null>;
    clear: () => Promise<boolean>;
  };
  notify: {
    newOrder: (payload: { orderId: number; title: string; body: string }) => Promise<void>;
    onClick: (cb: (payload: { orderId: number }) => void) => () => void;
  };
  badge: {
    set: (pending: number) => Promise<void>;
  };
  print: {
    ticket: (args: { html: string; deviceName?: string }) => Promise<{ ok: boolean; error?: string }>;
    listPrinters: () => Promise<
      Array<{
        name: string;
        displayName: string;
        description: string;
        isDefault: boolean;
        status: number;
      }>
    >;
    listUsb: () => Promise<
      Array<{
        vendorId: number;
        productId: number;
        manufacturer?: string;
        product?: string;
        serial?: string;
      }>
    >;
    order: (args: {
      order: unknown;
      mode: 'kitchen' | 'customer' | 'both';
      html?: { kitchen?: string; customer?: string };
    }) => Promise<{ ok: boolean; errors: string[] }>;
    testConfig: (args: {
      config: PrinterConfig;
      kind: 'kitchen' | 'customer';
    }) => Promise<{ ok: boolean; error?: string }>;
  };
  outbox: {
    enqueue: (args: { op: string; payload: unknown; localId?: string }) => Promise<OutboxEntry>;
    list: () => Promise<OutboxEntry[]>;
    update: (localId: string, patch: Partial<OutboxEntry>) => Promise<OutboxEntry | null>;
    delete: (localId: string) => Promise<boolean>;
    summary: () => Promise<OutboxSummary>;
    onSummaryChanged: (cb: (s: OutboxSummary) => void) => () => void;
  };
}

export type OutboxState = 'pending' | 'in_flight' | 'error';

export interface OutboxEntry {
  localId: string;
  op: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  state: OutboxState;
}

export interface OutboxSummary {
  pending: number;
  inFlight: number;
  errors: number;
  total: number;
}

export type PrinterConfig =
  | { type: 'os'; deviceName?: string | null }
  | { type: 'network'; host: string; port?: number }
  | { type: 'usb'; vendorId: number; productId: number; label?: string };

declare global {
  interface Window {
    pos?: PosApi;
  }
}

export function getPosApi(): PosApi | null {
  if (typeof window === 'undefined') return null;
  return window.pos ?? null;
}
