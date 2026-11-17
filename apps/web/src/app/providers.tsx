'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import type { Session } from '@supabase/supabase-js';
import { FolioProvider, Outbox, useLiveRefresh, useOutboxFlusher } from '@folio/api';
import { getSupabase } from '@/lib/supabase';
import { SessionContext } from '@/lib/session';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => count < 2 && !/sign in|permission|not found/i.test(String((err as Error)?.message)),
      },
      mutations: { retry: 0 },
    },
  });
}

const browserStorage = {
  getItem: (k: string) => (typeof window === 'undefined' ? null : window.localStorage.getItem(k)),
  setItem: (k: string, v: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(k, v);
  },
};

const isVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';

function SyncBridge({ userId }: { userId: string | null }) {
  useLiveRefresh(!!userId, isVisible);
  const flush = useOutboxFlusher();
  useEffect(() => {
    if (!userId) return;
    void flush();
    const on = () => void flush();
    window.addEventListener('online', on);
    const t = setInterval(on, 60_000);
    return () => {
      window.removeEventListener('online', on);
      clearInterval(t);
    };
  }, [userId, flush]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(makeQueryClient);
  const sb = useMemo(() => getSupabase(), []);
  const outbox = useMemo(() => new Outbox(browserStorage), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [sb, qc]);

  return (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ session, ready }}>
        <FolioProvider client={sb} outbox={outbox} source="web">
          <SyncBridge userId={session?.user.id ?? null} />
          {children}
        </FolioProvider>
      </SessionContext.Provider>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: { background: '#161616', border: '1px solid rgba(255,255,255,0.12)', color: '#f4f3ee', borderRadius: 16, fontFamily: 'var(--font-manrope)' },
        }}
      />
    </QueryClientProvider>
  );
}
