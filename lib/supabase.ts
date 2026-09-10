import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnvConfig } from '@/lib/config';

const config = getSupabaseEnvConfig();

// Client-facing flag: use only public keys so the browser can detect config
// SUPABASE_SERVICE_ROLE_KEY is server-only and never inlined in client bundles.
export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.anonKey);

/**
 * SESSION STORAGE CONTRACT — the browser client MUST share its session through
 * cookies (`createBrowserClient`), never localStorage. Server Components
 * (`createSupabaseServerClient`) and the middleware (`createServerClient`) read
 * the session from cookies; a localStorage-only client produces the
 * "login → glimpse of dashboard → kicked to /login" loop on production.
 */
export const supabase = createBrowserClient(
  config.supabaseUrl || 'https://example.supabase.co',
  config.anonKey || 'invalid-anon-key'
);
