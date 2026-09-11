import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseEnvConfig } from '@/lib/config';
import { isSafeDashboardPath } from '@/lib/services/dashboardPaths';

/**
 * PLATFORM ADMIN GATE — single guard for /admin pages and /api/admin/*.
 *
 * The platform owner role (`platform_admins`) is intentionally SEPARATE from
 * clinic tenants: a clinic owner has zero platform rights unless a row exists
 * in `platform_admins` for their auth user. Every admin page (server layout)
 * and every admin API calls `requirePlatformAdmin(req)` before doing anything.
 */

export type PlatformAdmin = {
  id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'viewer';
};

export type PlatformAdminResult =
  | { ok: true; admin: PlatformAdmin; status?: never }
  | { ok: false; status: number };

/** Resolves the requesting user's platform-admin row, if any. */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  if (!getSupabaseEnvConfig().isConfigured) {
    // Local demo: the seeded admin email acts as the platform owner so admin
    // flows remain testable without a real second account.
    const demo = 'shadi_nouri78@hotmail.com';
    return { id: 'demo', user_id: 'demo', email: demo, role: 'owner' } as PlatformAdmin;
  }

  const { data: user, error } = await createSupabaseServerClient().auth.getUser();
  if (error || !user?.user) return null;

  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('id, user_id, email, role')
    .eq('user_id', user.user.id)
    .maybeSingle();
  return data as PlatformAdmin | null;
}

/** Guard used by APIs. `req` is optional — the session comes from cookies. */
export async function requirePlatformAdmin(req?: Request): Promise<PlatformAdminResult> {
  void req;
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, status: 401 };
  if (admin.role === 'viewer') return { ok: false, status: 403 };
  return { ok: true, admin };
}

/** Re-exported so admin routes can reuse the safe-path guard for `?next=`. */
export { isSafeDashboardPath };