import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { posAuthStorage } from './pos-storage-adapter';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Placeholders let the static export prerender without crashing when env vars
// are absent at build time. The `supabaseConfigured` flag lets the UI surface
// a config-error state instead of triggering doomed network calls.
const url = envUrl || 'https://placeholder.supabase.co';
const anonKey = envKey || 'placeholder-anon-key';

// Persistent auth state, encrypted at rest via safeStorage. Supabase JS
// owns the refresh loop end-to-end — access tokens are refreshed a minute
// before expiry, the fresh refresh token is written back to storage, and
// the session survives quits/reboots for as long as the project's refresh-
// token TTL (default 60 days). No manual load/save from our side is needed.
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    storage: posAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Explicit storageKey so if we ever swap projects we don't clash.
    storageKey: 'swiftqr-pos-auth',
  },
});

export const supabaseConfigured = Boolean(envUrl && envKey);
