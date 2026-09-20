/**
 * Vercel Domains API — per-tenant clinic subdomains.
 *
 * Multi-tenant routing contract:
 *   hala-clinic.dentairec.com  →  /hala-clinic   (middleware rewrite)
 *
 * This module owns TWO concerns that must never drift apart:
 *   1. The pure routing rules (root domain, reserved list, slug validation)
 *      consumed by `middleware.ts` — Edge-safe: no Node-only APIs, no DB.
 *   2. The Vercel API client that registers/removes the domain on the project
 *      so Vercel serves the tenant host at all.
 *
 * Credentials are server-only (`VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID`); they
 * are never exposed to the browser and never logged.
 */
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';
import { RESERVED_PUBLIC_SLUGS } from '@/lib/services/activityTypes';

const VERCEL_API = 'https://api.vercel.com';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Root domain that tenant subdomains hang off, derived from the single
 * canonical-origin source of truth (`PRODUCTION_BASE_URL`, docs/AEO-GEO.md §9)
 * so the official domain is never declared twice.
 */
export const TENANT_ROOT_DOMAIN: string = (() => {
  try {
    return new URL(PRODUCTION_BASE_URL).hostname.replace(/^www\./, '');
  } catch {
    return 'dentairec.com';
  }
})();

/**
 * Subdomains that are NEVER a tenant. Two groups:
 *   - every reserved public slug (a tenant slug colliding with a static route
 *     would be unreachable at /{slug}, so registration already rejects them);
 *   - infrastructure hosts that must keep pointing at the platform itself.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set<string>([
  // `Array.from` (not `[...set]`): the project compiles with the default
  // ES5 target, where spreading an iterable requires `downlevelIteration`.
  ...Array.from(RESERVED_PUBLIC_SLUGS),
  'www',
  'app',
  'mail',
  'email',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'cdn',
  'static',
  'assets',
  'ns',
  'ns1',
  'ns2',
  'staging',
  'preview',
  'dev',
  'test',
]);

/**
 * DNS-safe tenant label: 1-31 chars, lowercase alphanumerics and inner dashes.
 * Stricter than the registration regex (`/^[a-z0-9-]+$/`) on purpose — a
 * hostname label may not start/end with a dash — so a legacy slug that only
 * passes the looser rule is rejected here instead of producing a broken host.
 */
export function isValidTenantSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,29}[a-z0-9])?$/.test(slug);
}

/** Normalises user input the same way everywhere (middleware + API routes). */
export function normalizeTenantSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug);
}

/** Fully-qualified tenant host, e.g. `hala-clinic.dentairec.com`. */
export function clinicSubdomain(slug: string): string {
  return `${slug}.${TENANT_ROOT_DOMAIN}`;
}

/**
 * True when `hostname` is a tenant host; returns its label.
 * The apex, `www.dentairec.com` and any nested host (`a.b.dentairec.com`) are
 * NOT tenant hosts.
 */
export function tenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
  const suffix = `.${TENANT_ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) return null;
  return label;
}

/**
 * Path branches owned by the platform itself (never a tenant public space).
 * Mirrors the middleware contract; kept here so the routing rules are pure,
 * Edge-safe and unit-testable in one place.
 */
export const PLATFORM_PATH_PREFIXES: readonly string[] = [
  '/api',
  '/dashboard',
  '/admin',
  '/auth',
  '/login',
  '/register',
  '/portal',
  '/_next',
];

/**
 * File-like paths are platform-owned static/metadata surfaces
 * (`/robots.txt`, `/sitemap.xml`, `/llms.txt`, the IndexNow key file, images).
 * A tenant space only exists at `/{slug}`, so rewriting these would guarantee a
 * 404 (`/hala-clinic/robots.txt`) and hide the platform's crawler files from
 * tenant hosts.
 */
export function isFileLikePath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

/**
 * Computes the tenant rewrite target for a host label + path, or null when the
 * request must keep its own path.
 *
 * Returns the rewritten path (e.g. `/hala-clinic`, `/hala-clinic/book`) or
 * null for: platform prefixes, file-like paths, and paths already carrying the
 * tenant prefix.
 */
export function tenantPathRewrite(slug: string, pathname: string): string | null {
  if (PLATFORM_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  if (isFileLikePath(pathname)) return null;
  if (pathname.startsWith(`/${slug}/`)) return null; // already rewritten
  return pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;
}

export type SubdomainResult =
  | { success: true; domain: string; verified: boolean; alreadyExisted: boolean }
  | { success: false; error: string; code?: string };

/** Vercel error shape (v9/v10 domain endpoints). */
interface VercelErrorBody {
  error?: { code?: string; message?: string; invalidToken?: boolean };
}

function credentials(): { token: string; projectId: string } | null {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId };
}

/**
 * Registers `{slug}.{root}` on the Vercel project so the tenant host is served
 * by this deployment. Idempotent: Vercel's `domain_already_exists` is reported
 * as success (`alreadyExisted: true`) because the desired end state is already
 * true — re-running this must never fail a tenant setup.
 */
export async function addClinicSubdomain(slug: string): Promise<SubdomainResult> {
  const label = normalizeTenantSlug(slug);
  const domain = clinicSubdomain(label);
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) {
    return { success: false, error: 'INVALID_SLUG', code: 'invalid_slug' };
  }

  const creds = credentials();
  if (!creds) return { success: false, error: 'CREDENTIALS_MISSING', code: 'credentials_missing' };

  try {
    const res = await fetch(`${VERCEL_API}/v10/projects/${creds.projectId}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => ({}))) as VercelErrorBody & {
      name?: string;
      verified?: boolean;
    };

    if (res.ok) {
      return {
        success: true,
        domain: body.name ?? domain,
        verified: body.verified === true,
        alreadyExisted: false,
      };
    }

    if (body.error?.code === 'domain_already_exists') {
      return { success: true, domain, verified: true, alreadyExisted: true };
    }

    return {
      success: false,
      error: body.error?.message ?? `Vercel API ${res.status}`,
      code: body.error?.code ?? `http_${res.status}`,
    };
  } catch (error) {
    return { success: false, error: String(error), code: 'request_failed' };
  }
}

/**
 * Removes the tenant domain from the Vercel project (slug rename / tenant
 * removal). DNS is untouched — the wildcard record keeps pointing here.
 */
export async function removeClinicSubdomain(slug: string): Promise<SubdomainResult> {
  const label = normalizeTenantSlug(slug);
  const domain = clinicSubdomain(label);
  if (!isValidTenantSlug(label)) {
    return { success: false, error: 'INVALID_SLUG', code: 'invalid_slug' };
  }

  const creds = credentials();
  if (!creds) return { success: false, error: 'CREDENTIALS_MISSING', code: 'credentials_missing' };

  try {
    const res = await fetch(
      `${VERCEL_API}/v9/projects/${creds.projectId}/domains/${encodeURIComponent(domain)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${creds.token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (res.ok) return { success: true, domain, verified: false, alreadyExisted: false };

    const body = (await res.json().catch(() => ({}))) as VercelErrorBody;
    return {
      success: false,
      error: body.error?.message ?? `Vercel API ${res.status}`,
      code: body.error?.code ?? `http_${res.status}`,
    };
  } catch (error) {
    return { success: false, error: String(error), code: 'request_failed' };
  }
}

