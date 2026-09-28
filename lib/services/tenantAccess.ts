import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseEnvConfig } from '@/lib/config';
import { isSafeDashboardPath } from '@/lib/services/dashboardPaths';

/**
 * TENANT-ISOLATED DASHBOARD — server-side tenant resolution.
 *
 * Source of truth: `clinicSlug` from the URL. The server:
 *   1. authenticates the current user (cookies → Supabase Auth),
 *   2. resolves the clinic row by slug,
 *   3. checks an ACTIVE `clinic_users` membership for (user, clinic),
 *   4. grants access with the role only when the membership exists.
 *
 * Step 2 also accepts a clinic **uuid** token (B20): notification rows written
 * before links were built from the slug carry `/dashboard/{clinic_id}/…`, and a
 * uuid is unambiguously routable to exactly one row. It is a lookup alias for
 * the tenant row only — steps 1, 3 and 4 are identical either way.
 *
 * RLS / `authorizeClinicRequest` / `app_user_is_active_clinic_member` are
 * untouched — this guard sits in front of the dashboard layout and every
 * nested module page. No client-provided clinic_id is ever trusted here.
 */

export type TenantAccessResult =
  | { ok: true; status: 200; clinicId: string; clinic: { id: string; slug: string; name: string }; role: string }
  | { ok: false; status: 401 | 403 | 404; clinic?: { id: string; slug: string; name: string } };

/** A well-formed clinic uuid — the legacy tenant token found in stored links. */
const UUID_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The slug alphabet enforced at registration (`/^[a-z0-9-]+$/`). */
const SLUG_TOKEN = /^[a-z0-9-]+$/;

/**
 * B20 — PostgREST filter that selects the tenant row from a URL token.
 *
 * A slug token matches `slug` (unchanged behaviour). A UUID token additionally
 * matches `id`, so historic notification deep links built from `clinic_id`
 * resolve instead of 404ing. Both alphabets are already known-safe (`[a-z0-9-]`
 * / `[0-9a-f-]`) because `resolveTenantAccess` rejects any other token before
 * this runs — so no PostgREST metacharacter can reach the expression.
 *
 * This is a ROUTING alias only: the active-membership check below still decides
 * access, so a uuid in the URL grants nothing by itself.
 */
function tenantTokenFilter(token: string): string {
  return UUID_TOKEN.test(token) ? `slug.eq.${token},id.eq.${token}` : `slug.eq.${token}`;
}

/**
 * B20 — clinic id → canonical slug, for producers that build tenant dashboard
 * links. Notification writers only ever hold a `clinic_id`, while the canonical
 * tenant token in a URL is the slug (`tenantDashboardUrl(slug, module)`).
 *
 * Never throws: a lookup problem returns null so the caller degrades to the
 * id-alias form (which `resolveTenantAccess` accepts) instead of failing the
 * business operation that merely wanted to raise a notification.
 */
export async function getClinicSlugById(clinicId: string | null | undefined): Promise<string | null> {
  try {
    const id = String(clinicId ?? '').trim();
    if (!id) return null;
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('slug')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return null;
    const slug = (data as { slug?: unknown } | null)?.slug;
    return typeof slug === 'string' && slug ? slug : null;
  } catch {
    return null;
  }
}

export async function resolveTenantAccess(clinicSlug: string): Promise<TenantAccessResult> {
  const slug = String(clinicSlug ?? '').trim().toLowerCase();
  if (!slug) return { ok: false, status: 404 };

  // B20 — the token must be a slug or a uuid. Nothing else can name a clinic, and
  // rejecting it here is what keeps `tenantTokenFilter` free of PostgREST
  // metacharacters (`/dashboard/a,id.ne.b` can never build a filter expression).
  if (!UUID_TOKEN.test(slug) && !SLUG_TOKEN.test(slug)) return { ok: false, status: 404 };

  // Local demo mode (no Supabase env): allow tenant access so the dev flow keeps
  // working exactly like the previous client-only demo session. Production is
  // always configured, so this branch never weakens real auth.
  if (!getSupabaseEnvConfig().isConfigured) {
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('id, slug, name')
      .or(tenantTokenFilter(slug))
      .is('deleted_at', null)
      .maybeSingle();
    if (!clinic) return { ok: false, status: 404 };
    return { ok: true, status: 200, clinicId: clinic.id, clinic, role: 'owner' };
  }

  // 1. Authenticate.
  const serverClient = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) return { ok: false, status: 401 };

  // 2. Resolve the clinic by slug (or by id — B20 legacy-link alias).
  const { data: clinic, error: clinicError } = await supabaseAdmin
    .from('clinics')
    .select('id, slug, name')
    .or(tenantTokenFilter(slug))
    .is('deleted_at', null)
    .maybeSingle();
  if (clinicError || !clinic) return { ok: false, status: 404 };

  // 3+4. Active membership for (user, clinic).
  const { data: member, error: memberError } = await supabaseAdmin
    .from('clinic_users')
    .select('role')
    .eq('clinic_id', clinic.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (memberError || !member) return { ok: false, status: 403, clinic };

  return { ok: true, status: 200, clinicId: clinic.id, clinic, role: member.role };
}

/**
 * For legacy flat dashboard paths (`/dashboard/{module}`).
 * Returns the canonical tenant path, the multi-tenant picker, or a safe login
 * path — based on the authenticated user's memberships. Never picks a tenant
 * arbitrarily when the user has multiple memberships.
 */
export async function resolveTenantRedirect(modulePath: string): Promise<string> {
  const safeLegacy = `/dashboard${modulePath}`;

  if (!getSupabaseEnvConfig().isConfigured) {
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('slug')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return clinic?.slug ? `/dashboard/${clinic.slug}${modulePath}` : `/login?next=${encodeURIComponent(safeLegacy)}`;
  }

  const serverClient = createSupabaseServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return `/login?next=${encodeURIComponent(safeLegacy)}`;

  const { data: memberships } = await supabaseAdmin
    .from('clinic_users')
    .select('clinic:clinics(slug)')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  const slugs = (memberships ?? [])
    .map((m) => (Array.isArray(m.clinic) ? m.clinic[0]?.slug : (m.clinic as { slug?: string } | null)?.slug))
    .filter((s): s is string => Boolean(s));

  if (slugs.length === 0) return `/login?next=${encodeURIComponent(safeLegacy)}`;
  if (slugs.length === 1) return `/dashboard/${slugs[0]}${modulePath}`;
  return `/dashboard/tenants?next=${encodeURIComponent(safeLegacy)}`;
}

/** Guard for login `?next=` — safe dashboard paths only. */
export { isSafeDashboardPath };