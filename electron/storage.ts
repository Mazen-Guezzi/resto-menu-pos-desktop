import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Generic encrypted key-value store used by the Supabase JS client's storage
 * interface. The whole map is serialized to a single file in userData and
 * encrypted with the OS keychain (via Electron `safeStorage`). Individual
 * keys are then read/written by rewriting the whole file, which is fine for
 * the low-frequency auth-token writes this backs (< 1 write/hour typical).
 */

const STORE_FILE = () => join(app.getPath('userData'), 'store.enc');

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  const path = STORE_FILE();
  if (!existsSync(path)) {
    cache = {};
    return cache;
  }
  try {
    const buf = readFileSync(path);
    const text = buf.toString('utf8');
    if (text.startsWith('PLAIN:')) {
      cache = JSON.parse(text.slice(6));
      return cache!;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      cache = {};
      return cache!;
    }
    cache = JSON.parse(safeStorage.decryptString(buf));
    return cache!;
  } catch (err) {
    console.error('[storage] failed to load', err);
    cache = {};
    return cache;
  }
}

function persist() {
  const path = STORE_FILE();
  const json = JSON.stringify(cache ?? {});
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(path, safeStorage.encryptString(json));
    } else {
      // Fallback — Linux without a keychain.
      writeFileSync(path, `PLAIN:${json}`, 'utf8');
    }
  } catch (err) {
    console.error('[storage] failed to persist', err);
  }
}

export function storageGet(key: string): string | null {
  const map = load();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

export function storageSet(key: string, value: string): void {
  const map = load();
  map[key] = value;
  persist();
}

export function storageRemove(key: string): void {
  const map = load();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
    persist();
  }
}
