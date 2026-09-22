import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Resolves an auth user id from an email address (case-insensitive).
 *
 * The supabase-js admin API (v2.110) exposes no `getUserByEmail`, so this walks
 * `listUsers()` pages. `perPage: 1000` is the API maximum; the loop is capped so
 * a pathological project can never spin forever. Any error/infra failure returns
 * null — callers treat "unknown" as "no account", which is the safe branch for
 * invitations (never block, never assume an account exists).
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const perPage = 1000;
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) return null;

      const users = data?.users ?? [];
      const match = users.find((u: { email?: string | null }) => (u.email ?? '').toLowerCase() === target);
      if (match) return match.id;

      // Last page reached (shorter than a full page).
      if (users.length < perPage) return null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Masks an email for display in invitation screens: `s*****@example.com`.
 * Used when an invitation is bound to an email the viewer may not see in full.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  const hidden = '*'.repeat(Math.max(local.length - visible.length, 3));
  return `${visible}${hidden}@${domain}`;
}
