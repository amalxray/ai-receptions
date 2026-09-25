/**
 * Tenant existence lookup for the legacy-URL redirect (middleware).
 *
 * WHY a lookup at all: `https://www.dentairec.com/hala-clinic` → 301
 * `https://hala-clinic.dentairec.com` may only be issued for a slug that really
 * is a tenant. A 301 for a typo/non-existent slug is cached by browsers AND
 * crawlers essentially forever, and there is no way to revoke it. Unknown slugs
 * therefore keep their current (404) behaviour on the apex path.
 *
 * HOW: the public `GET /api/clinic/check-slug?slug=…` endpoint — already the
 * source of truth for the registration form — answers `available: false,
 * reason: 'taken'` for a live tenant. No new API surface, no schema access from
 * the Edge runtime.
 *
 * FAIL-OPEN by design: any error, timeout or non-2xx answer returns `false`, so
 * the middleware falls through to normal routing (today's behaviour) instead of
 * blocking a real patient on an internal hiccup.
 *
 * A small in-isolate cache keeps this off the hot path: legacy apex paths are
 * rare, and a 301 decision is stable for minutes at a time.
 */

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = 2_000;

const cache = new Map<string, { exists: boolean; expiresAt: number }>();

function remember(slug: string, exists: boolean): void {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(slug, { exists, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * True when `slug` belongs to a live (non-deleted) tenant.
 *
 * @param origin Absolute origin of this deployment (`request.nextUrl.origin`) —
 *   the lookup is an internal request to the platform's own public endpoint.
 */
export async function tenantSlugExists(slug: string, origin: string): Promise<boolean> {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.exists;

  try {
    const url = new URL('/api/clinic/check-slug', origin);
    url.searchParams.set('slug', slug);
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as
      | { available?: unknown; reason?: unknown }
      | null;
    if (!body || typeof body.available !== 'boolean') return false;
    const exists = body.available === false && body.reason === 'taken';
    remember(slug, exists);
    return exists;
  } catch {
    return false;
  }
}

/** Test seam: drops the in-isolate cache (never called in production code). */
export function clearTenantSlugCache(): void {
  cache.clear();
}