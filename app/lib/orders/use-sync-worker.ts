'use client';

import { useEffect, useRef, useState } from 'react';
import { getPosApi, type OutboxEntry, type OutboxSummary } from '../pos-api';
import { insertOrderPayload, type NewOrderPayload } from './create';

const POLL_MS = 15_000;
const MAX_ATTEMPTS = 20;

function backoffMs(attempts: number): number {
  return Math.min(60_000 * Math.pow(2, attempts), 15 * 60_000);
}

/**
 * Long-lived worker: drains the offline outbox against Supabase whenever the
 * process is online. Runs while the (pos) layout is mounted (i.e. any time
 * the user is signed in). Also exposes the live summary counters so the header
 * can show "N pending sync".
 */
export function useSyncWorker(): OutboxSummary {
  const [summary, setSummary] = useState<OutboxSummary>({
    pending: 0,
    inFlight: 0,
    errors: 0,
    total: 0,
  });
  const draining = useRef(false);

  useEffect(() => {
    const pos = getPosApi();
    if (!pos) return;

    let cancelled = false;

    const drain = async () => {
      if (draining.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      draining.current = true;
      try {
        const entries = (await pos.outbox.list()) as OutboxEntry[];
        const now = Date.now();
        const ready = entries.filter(
          (e) => e.state === 'pending' && e.nextAttemptAt <= now,
        );
        for (const entry of ready) {
          if (cancelled) return;
          await pos.outbox.update(entry.localId, { state: 'in_flight' });
          try {
            if (entry.op === 'orders.insert') {
              await insertOrderPayload(entry.payload as NewOrderPayload);
            }
            await pos.outbox.delete(entry.localId);
          } catch (err) {
            const nextAttempts = entry.attempts + 1;
            const nextState = nextAttempts >= MAX_ATTEMPTS ? 'error' : 'pending';
            await pos.outbox.update(entry.localId, {
              state: nextState,
              attempts: nextAttempts,
              lastError: err instanceof Error ? err.message : String(err),
              nextAttemptAt: Date.now() + backoffMs(nextAttempts),
            });
          }
        }
      } finally {
        draining.current = false;
      }
    };

    // Initial summary + subscribe to changes.
    pos.outbox.summary().then((s) => {
      if (!cancelled) setSummary(s);
    });
    const unsub = pos.outbox.onSummaryChanged((s) => {
      if (!cancelled) setSummary(s);
    });

    // Kick off immediately, then poll.
    drain();
    const id = setInterval(drain, POLL_MS);

    const onOnline = () => drain();
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('online', onOnline);
      unsub();
    };
  }, []);

  return summary;
}
