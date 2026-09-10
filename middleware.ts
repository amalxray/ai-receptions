import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseCoreConfig } from '@/lib/supabase/config';

/**
 * SUPABASE SSR SESSION REFRESH — middleware.
 *
 * Responsibilities (STRICT scope):
 *   - Refresh the Supabase auth cookies on EVERY request (rotate refresh token,
 *     keep `getUser()` coherent for Server Components / Route Handlers).
 *   - NEVER performs authorization. Tenant + membership authorization stays in
 *     `resolveTenantAccess()` (dashboard layout) and `authorizeClinicRequest()`
 *     (API routes). No redirects are issued here — public tenant routes, booking,
 *     AI chat and auth routes keep working without forced login.
 *
 * The `matcher` below excludes static assets so they are never processed.
 */
export async function middleware(request: NextRequest) {
  const { supabaseUrl, anonKey } = getSupabaseCoreConfig();

  let response = NextResponse.next({ request });

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
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run anything between client creation and getUser() — this
  // both refreshes the session and protects against CSRF in the cookie flow.
  // Errors here simply mean "no/session refresh not possible" → pass through;
  // the page/role guards decide access.
  try {
    await supabase.auth.getUser();
  } catch {
    // Best-effort refresh only — never block requests on session refresh errors.
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};