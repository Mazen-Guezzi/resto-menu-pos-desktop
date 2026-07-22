import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredSession } from './channels';

export type { StoredSession };

function sessionFile() {
  return join(app.getPath('userData'), 'session.enc');
}

export function saveSession(session: StoredSession): void {
  const json = JSON.stringify(session);
  const path = sessionFile();
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(json);
    writeFileSync(path, buf);
  } else {
    // Fallback: write plaintext with a marker byte. Linux without a keychain
    // (headless / no libsecret) hits this. Better than refusing to persist.
    console.warn('[auth] safeStorage unavailable — writing session as plaintext');
    writeFileSync(path, `PLAIN:${json}`, 'utf8');
  }
}

export function loadSession(): StoredSession | null {
  const path = sessionFile();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path);
    const text = raw.toString('utf8');
    if (text.startsWith('PLAIN:')) {
      return JSON.parse(text.slice(6));
    }
    if (!safeStorage.isEncryptionAvailable()) return null;
    const decrypted = safeStorage.decryptString(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('[auth] failed to load session', err);
    return null;
  }
}

export function clearSession(): void {
  const path = sessionFile();
  if (existsSync(path)) unlinkSync(path);
}
