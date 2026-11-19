'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * The site, /rest and /auth share one origin behind the gateway, so in
 * production the API is wherever the page was served from. Set
 * NEXT_PUBLIC_SUPABASE_URL only to point a dev build at another server.
 */
function apiUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url && url !== 'same-origin') return url;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://127.0.0.1:54321';
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith('replace'));
}

/** Browser client; the session lives in cookies so the proxy can refresh it. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createBrowserClient(apiUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key');
  return client;
}
