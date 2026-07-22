'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getPosApi } from './pos-api';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  activeBusinessId: string | null;
  setActiveBusinessId: (id: string | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);

  useEffect(() => {
    // React strict mode double-invokes this effect in dev. We let both runs
    // proceed — each keeps its own `cancelled` flag so the survivor still
    // finishes hydration. Attempting to dedupe with a module/ref guard
    // strands the second run and the app stays "Loading…" forever.
    let cancelled = false;

    (async () => {
      const pos = getPosApi();
      try {
        if (pos) {
          const stored = await pos.auth.load();
          if (stored && !cancelled) {
            const { data } = await supabase.auth.setSession({
              access_token: stored.access_token,
              refresh_token: stored.refresh_token,
            });
            if (!cancelled) setSession(data.session);
          }
          const bizId = await pos.prefs.get<string | null>('activeBusinessId');
          if (!cancelled) setActiveBusinessIdState(bizId ?? null);
        }
      } catch (err) {
        console.error('[session] hydration failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const pos = getPosApi();
      if (!pos) return;
      if (next) {
        pos.auth.save({
          access_token: next.access_token,
          refresh_token: next.refresh_token,
          expires_at: next.expires_at,
          user_id: next.user?.id,
          email: next.user?.email ?? null,
        });
      } else {
        pos.auth.clear();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      activeBusinessId,
      setActiveBusinessId: async (id) => {
        setActiveBusinessIdState(id);
        await getPosApi()?.prefs.set('activeBusinessId', id);
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, activeBusinessId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}
