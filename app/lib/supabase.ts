import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Placeholders let the static export prerender without crashing when env vars
// are absent at build time. The `supabaseConfigured` flag lets the UI surface
// a config-error state instead of triggering doomed network calls.
const url = envUrl || 'https://placeholder.supabase.co';
const anonKey = envKey || 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const supabaseConfigured = Boolean(envUrl && envKey);
