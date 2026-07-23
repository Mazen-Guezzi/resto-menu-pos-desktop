'use client';

import { getPosApi } from './pos-api';

/**
 * Storage adapter Supabase JS uses to persist its auth state (access token,
 * refresh token, expires_at, user). By routing through pos.storage we get:
 *
 *   • Encrypted-at-rest storage via the OS keychain (Electron safeStorage)
 *   • Automatic refresh-token rotation: every time Supabase refreshes the
 *     access token it also gets a fresh refresh token and writes back here.
 *     Because we surface a persistent key-value store, that new refresh
 *     token survives app restarts — the operator stays logged in for as
 *     long as the refresh-token TTL configured in the Supabase project
 *     (default 60 days).
 *   • Cross-restart durability: even if the machine reboots mid-shift, the
 *     next launch picks up where we left off.
 *
 * During SSG (Next static export at build time) `window` is undefined so
 * everything no-ops safely.
 */
export const posAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const pos = getPosApi();
    if (!pos) return null;
    try {
      return (await pos.storage.get(key)) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const pos = getPosApi();
    if (!pos) return;
    try {
      await pos.storage.set(key, value);
    } catch {
      /* ignore — best-effort */
    }
  },
  async removeItem(key: string): Promise<void> {
    const pos = getPosApi();
    if (!pos) return;
    try {
      await pos.storage.remove(key);
    } catch {
      /* ignore */
    }
  },
};
