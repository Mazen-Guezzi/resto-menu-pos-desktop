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
    // Supabase JS now owns session persistence via posAuthStorage — it
    // reads the stored tokens on client construction and refreshes them in
    // the background. We just need to (a) surface the current session to
    // React state and (b) load the active-business preference on boot.
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setSession(data.session);
        const pos = getPosApi();
        if (pos) {
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
