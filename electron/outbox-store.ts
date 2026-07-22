import Store from 'electron-store';

export type OutboxState = 'pending' | 'in_flight' | 'error';

export interface OutboxEntry {
  localId: string;
  op: 'orders.insert';
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  state: OutboxState;
}

interface OutboxShape {
  entries: OutboxEntry[];
}

const store = new Store<OutboxShape>({
  name: 'swiftqr-pos-outbox',
  defaults: { entries: [] },
});

type Listener = (summary: OutboxSummary) => void;
const listeners = new Set<Listener>();

export interface OutboxSummary {
  pending: number;
  inFlight: number;
  errors: number;
  total: number;
}

function summarize(entries: OutboxEntry[]): OutboxSummary {
  let pending = 0;
  let inFlight = 0;
  let errors = 0;
  for (const e of entries) {
    if (e.state === 'pending') pending += 1;
    else if (e.state === 'in_flight') inFlight += 1;
    else errors += 1;
  }
  return { pending, inFlight, errors, total: entries.length };
}

function notify() {
  const s = summarize(store.get('entries'));
  for (const cb of listeners) cb(s);
}

export function subscribeSummary(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function listOutbox(): OutboxEntry[] {
  return store.get('entries');
}

export function currentSummary(): OutboxSummary {
  return summarize(store.get('entries'));
}

export function enqueue(entry: Omit<OutboxEntry, 'localId' | 'createdAt' | 'attempts' | 'lastError' | 'nextAttemptAt' | 'state'> & { localId?: string }): OutboxEntry {
  const now = Date.now();
  const localId = entry.localId ?? cryptoRandomId();
  const full: OutboxEntry = {
    localId,
    op: entry.op,
    payload: entry.payload,
    createdAt: now,
    attempts: 0,
    lastError: null,
    nextAttemptAt: now,
    state: 'pending',
  };
  const entries = store.get('entries');
  entries.push(full);
  store.set('entries', entries);
  notify();
  return full;
}

export function updateEntry(localId: string, patch: Partial<OutboxEntry>): OutboxEntry | null {
  const entries = store.get('entries');
  const idx = entries.findIndex((e) => e.localId === localId);
  if (idx === -1) return null;
  const next = { ...entries[idx], ...patch };
  entries[idx] = next;
  store.set('entries', entries);
  notify();
  return next;
}

export function deleteEntry(localId: string): boolean {
  const entries = store.get('entries');
  const idx = entries.findIndex((e) => e.localId === localId);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  store.set('entries', entries);
  notify();
  return true;
}

function cryptoRandomId(): string {
  // Node 20 has global crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
