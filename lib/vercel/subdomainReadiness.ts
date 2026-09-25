/**
 * Vercel project domain registry — READ-ONLY source of truth for "is this
 * tenant host actually served?".
 *
 * WHY READINESS MUST BE VERCEL-AUTHORITATIVE (docs/AEO-GEO.md §9.1):
 *   `{slug}.dentairec.com` only resolves (and only gets a certificate) once the
 *   host is registered on the Vercel project. Provisioning is best-effort during
 *   registration/onboarding — every failure is swallowed so a tenant can never be
 *   blocked — so a clinic can have a live slug and NO registered host. Issuing the
 *   canonical 301 for such a tenant redirects patients, printed QR codes and
 *   crawlers to a host whose TLS handshake aborts. The DB (`settings.tenant`) can
 *   lag or be deleted by hand in Vercel, so the DECISION reads Vercel and the DB
 *   only ever records it.
 *
 * Caching: Vercel's own docs recommend caching domain lookups; every apex-path
 * request would otherwise call out to Vercel. A settled answer is cached for
 * `TTL_MS`; when Vercel cannot be reached we keep serving the last known-good
 * answer for `STALE_MS`, then report "not ready" (fail-closed: NOT redirecting
 * only loses a cosmetic canonical hop, redirecting to a dead host breaks the
 * tenant).
 *
 * Edge/middleware-safe: `fetch` + `process.env` only — no Node built-ins, no DB.
 */
import { clinicSubdomain, isReservedSubdomain, isValidTenantSlug, normalizeTenantSlug } from '@/lib/vercel/domains';

const VERCEL_API = 'https://api.vercel.com';
const REQUEST_TIMEOUT_MS = 10_000;

/** How long a successful listing is reused (Vercel-recommended short cache). */
export const TTL_MS = 60_000;
/** How long a successful listing survives API outages (stale-if-error). */
export const STALE_MS = 10 * 60_000;

type CacheEntry = { names: ReadonlySet<string>; at: number };

let cache: CacheEntry | null = null;
let inflight: Promise<ReadonlySet<string> | null> | null = null;

/** Test seam — clears the listing cache (and any in-flight dedupe). */
export function clearVercelDomainsCache(): void {
  cache = null;
  inflight = null;
}

function credentials(): { token: string; projectId: string } | null {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId };
}

/** Parses one page of the v9 domains listing (tolerant: any shape → empty). */
function pageNames(body: unknown): { names: string[]; next: number | null } {
  const parsed = body as { domains?: unknown; pagination?: { next?: unknown } } | null;
  const list = Array.isArray(parsed?.domains) ? parsed!.domains : [];
  const names = list
    .map((d) => (d as { name?: unknown })?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  // `pagination.next` is a millisecond timestamp cursor (or null at the end).
  const next = typeof parsed?.pagination?.next === 'number' ? parsed!.pagination!.next : null;
  return { names, next };
}

/**
 * Fetches the project's registered domain names.
 * Returns `null` when Vercel cannot be read (missing credentials, network,
 * non-2xx, timeout) — callers must treat null as "unknown".
 */
async function fetchDomainNames(): Promise<ReadonlySet<string> | null> {
  const creds = credentials();
  if (!creds) return null;

  const names = new Set<string>();
  let cursor: number | null = null;

  // Bounded paging: a tenant list is tiny, but a runaway loop must be impossible.
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${VERCEL_API}/v9/projects/${creds.projectId}/domains`);
    url.searchParams.set('limit', '100');
    if (cursor !== null) url.searchParams.set('until', String(cursor));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Never let an intermediary cache a credential-bearing response.
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = await res.json().catch(() => null);
    const parsed = pageNames(body);
    for (const name of parsed.names) names.add(name.toLowerCase());

    if (parsed.next === null || parsed.names.length === 0) break;
    cursor = parsed.next;
  }

  return names;
}

/**
 * Registered domain names of the Vercel project, cached.
 * @param fresh bypasses a warm cache (used right after a write, where stale data
 *              would produce a wrong "already in use" verdict).
 */
export async function readVercelProjectDomainNames(
  fresh = false
): Promise<ReadonlySet<string> | null> {
  const now = Date.now();

  if (!fresh && cache && now - cache.at < TTL_MS) return cache.names;
  // Deduplicate concurrent cold lookups: N parallel requests → one call.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const names = await fetchDomainNames();
      if (names) {
        cache = { names, at: Date.now() };
        return names;
      }
      // Stale-if-error: a Vercel outage must not flip every tenant to
      // "not ready" (which would silently drop the canonical redirect).
      if (cache && Date.now() - cache.at < STALE_MS) return cache.names;
      return null;
    } catch {
      if (cache && Date.now() - cache.at < STALE_MS) return cache.names;
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Is this exact host registered on the project?
 * FALSE both when the host is absent and when Vercel is unreadable — callers use
 * this to GATE a redirect/canonical tag, so "unknown" must never be permissive.
 */
export async function isHostnameRegistered(host: string, fresh = false): Promise<boolean> {
  const names = await readVercelProjectDomainNames(fresh);
  if (!names) return false;
  return names.has(host.trim().toLowerCase());
}

/**
 * Pure half of the readiness rule: does this slug's tenant host appear in a
 * (already fetched) project listing? Kept separate so a caller that needs the
 * verdict for MANY slugs pays for exactly one Vercel listing, and so the
 * slug→host mapping has a single implementation (`clinicSubdomain`).
 */
export function isSubdomainIn(names: ReadonlySet<string> | null, slug: string): boolean {
  if (!names) return false;
  const label = normalizeTenantSlug(slug);
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) return false;
  return names.has(clinicSubdomain(label));
}

/**
 * Is `{slug}.{root}` registered on the Vercel project — i.e. will the tenant
 * host actually answer (DNS + certificate) if we send a patient/crawler there?
 */
export async function isSubdomainReady(slug: string): Promise<boolean> {
  return isSubdomainIn(await readVercelProjectDomainNames(), slug);
}

