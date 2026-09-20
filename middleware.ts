import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseCoreConfig } from '@/lib/supabase/config';
import { tenantSlugFromHostname, tenantPathRewrite } from '@/lib/vercel/domains';

/**
 * SUPABASE SSR SESSION REFRESH + TENANT SUBDOMAIN ROUTING — middleware.
 *
 * Responsibilities (STRICT scope):
 *   - Refresh the Supabase auth cookies on EVERY request (rotate refresh token,
 *     keep `getUser()` coherent for Server Components / Route Handlers).
 *   - Rewrite tenant subdomains to their public space path:
 *     hala-clinic.dentairec.com → /hala-clinic (same page as the apex path).
 *     ONLY the tenant root is rewritten. Every other path on a tenant host keeps
 *     its own meaning (platform router): the clinic page's relative booking CTA
 *     `/book?slug=…`, `/discover`, crawler files, etc. Prefixing those with the
 *     slug pointed at routes that do not exist and 404'd real patient journeys.
 *   - NEVER performs authorization. Tenant + membership authorization stays in
 *     `resolveTenantAccess()` (dashboard layout) and `authorizeClinicRequest()`
 *     (API routes). The subdomain rewrite grants nothing: it only maps a host to
 *     the SAME public page that already exists on the canonical domain, and the
 *     slug must be a valid, non-reserved tenant label.
 *   - No redirects are issued for public routes — booking, AI chat and auth
 *     routes keep working without forced login.
 *
 * The `matcher` below excludes static assets so they are never processed.
 */
/**
 * Host used for tenant detection. Behind Vercel the public host is in
 * `x-forwarded-host`; `host` is the fallback for local/self-hosted runs.
 */
function hostHeader(request: NextRequest): string {
  return request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
}

/**
 * Builds the rewrite target for a tenant host, or null when the request must
 * keep its own path (platform surfaces, public pages, crawler/static files, or
 * nothing to rewrite).
 *
 * NOTE: only the tenant ROOT maps to the tenant space. Non-root paths are left
 * untouched so platform routes keep working on tenant hosts — the clinic space
 * links to the relative booking CTA `/book?slug=…`, which must reach the
 * booking page instead of a non-existent `/{slug}/book` (404).
 * The rule lives in `lib/vercel/domains.ts` (`tenantPathRewrite`) so it stays
 * unit-tested next to the rest of the host/slug contract.
 */
function tenantRewrite(request: NextRequest, slug: string): URL | null {
  const target = tenantPathRewrite(slug, request.nextUrl.pathname);
  if (!target) return null;
  const url = request.nextUrl.clone();
  url.pathname = target;
  return url;
}

export async function middleware(request: NextRequest) {
  const { supabaseUrl, anonKey } = getSupabaseCoreConfig();
  const { pathname } = request.nextUrl;

  // --- Tenant subdomain routing (pure host math; no DB, no authorization) ---
  const tenantSlug = tenantSlugFromHostname(hostHeader(request));
  const rewrite = tenantSlug ? tenantRewrite(request, tenantSlug) : null;
  const buildResponse = () =>
    rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request });

  let response = buildResponse();

  // Demo mode (no env): pass through untouched.
  if (!supabaseUrl || !anonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Rebuild the SAME kind of response (rewrite or next) so a tenant
        // rewrite is not silently dropped when cookies are refreshed.
        response = buildResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run anything between client creation and getUser() — this
  // both refreshes the session and protects against CSRF in the cookie flow.
  // Errors here simply mean "no/session refresh not possible".
  let authed = false;
  try {
    const { data } = await supabase.auth.getUser();
    authed = Boolean(data.user);
  } catch {
    // No session → treated as unauthenticated below.
  }

  // Admin page guard: /admin/* requires a session (the admin LAYOUT then
  // re-verifies the platform_admins row server-side before rendering).
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    if (!authed) return NextResponse.redirect(new URL('/login?next=/admin', request.url));
  }
  // Admin API guard: /api/admin/* without a session → 401 (Never redirect an API).
  if (pathname.startsWith('/api/admin')) {
    if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};