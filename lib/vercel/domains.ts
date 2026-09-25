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
  // Platform mailbox hosts: info/support/admin/noreply/billing@<root> are
  // platform-owned addresses (see lib/cloudflare/email.ts). Their labels must
  // never become tenant sites so the web and email namespaces stay conflict-free.
  'info',
  'support',
  'admin',
  'noreply',
  'billing',
  'postmaster',
  'abuse',
  'webmaster',
  'hostmaster',
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
 * Canonical absolute URL of a tenant's public space on its OWN subdomain:
 *   `hala-clinic` → `https://hala-clinic.dentairec.com`
 *
 * This is the single source of canonical tenant identity. Canonical tags,
 * JSON-LD, sitemap entries, the `/q/{publicId}` QR redirect, `/ask` booking
 * links and patient-facing pages all read it, so the shape can never drift
 * between surfaces. The root domain is `TENANT_ROOT_DOMAIN` (derived from
 * `PRODUCTION_BASE_URL`) — the official domain is never declared twice.
 *
 * The legacy path form (`https://www.dentairec.com/{slug}`) still resolves but
 * 301-redirects here (middleware), so both forms converge on one canonical URL.
 *
 * A slug that cannot be a DNS label, or that is reserved/infrastructure, has no
 * valid subdomain. Such slugs can never exist in the DB (registration rejects
 * them) — the apex path is returned as a safe fallback instead of emitting a
 * malformed host (`https://evil.com/x.dentairec.com` style injection).
 */
export function clinicSpaceUrl(slug: string): string {
  const label = normalizeTenantSlug(slug);
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) {
    return `${PRODUCTION_BASE_URL}/${encodeURIComponent(String(slug))}`;
  }
  return `https://${clinicSubdomain(label)}`;
}

/**
 * Hostname → comparable form: lowercase, port stripped, trailing root dot
 * stripped. Shared by every host rule so they can never disagree about what a
 * host is.
 */
export function normalizeHostname(hostname: string): string {
  return hostname.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
}

/**
 * True when `hostname` is a tenant host; returns its label.
 * The apex, `www.dentairec.com` and any nested host (`a.b.dentairec.com`) are
 * NOT tenant hosts.
 */
export function tenantSlugFromHostname(hostname: string): string | null {
  const host = normalizeHostname(hostname);
  const suffix = `.${TENANT_ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) return null;
  return label;
}

/**
 * Computes the tenant rewrite target for a host label + path.
 *
 * ONLY the tenant root maps to the tenant public space (`/` → `/{slug}`).
 * Every other path keeps its own meaning and is handled by the platform router
 * — `/book`, `/discover`, `/ask`, `/dashboard`, `/api/*`, crawler files
 * (`/robots.txt`), static assets…
 *
 * Why not prefix other paths with the slug: those nested routes do not exist,
 * so prefixing produced guaranteed 404s. Concretely, the clinic public space
 * renders its booking CTA as a RELATIVE `/book?slug=…`; on a tenant host that
 * was rewritten to `/{slug}/book` and every patient landing on the subdomain
 * hit a 404 when trying to book. Leaving non-root paths untouched also keeps
 * crawler/static surfaces (`/robots.txt`, `/llms.txt`, `/sitemap.xml`) and the
 * deep-link routes (`/c/{slug}`, `/d/{slug}`) working on tenant hosts.
 */
export function tenantPathRewrite(slug: string, pathname: string): string | null {
  return pathname === '/' ? `/${slug}` : null;
}

/**
 * Extracts the tenant label from a LEGACY apex path (`/hala-clinic`).
 *
 * Returns null for anything that is not a single segment a tenant could own:
 *   - platform/static routes (`/book`, `/dashboard`, `/ask`, …) → reserved list;
 *   - file-like paths (`/sitemap.xml`, `/robots.txt`, `/llms.txt`) → invalid label;
 *   - multi-segment paths (`/d/dr-x`, `/c/hala-clinic`, `/api/…`) → not the
 *     tenant ROOT, and the canonical space has no nested routes.
 *
 * Trailing/leading slashes are tolerated (`/hala-clinic/` is the same page) and
 * the segment is percent-decoded before validation, so `%2F` can never smuggle a
 * second segment into the host.
 */
export function apexTenantSlugFromPath(pathname: string): string | null {
  const path = (pathname.split('?')[0] ?? '').split('#')[0] ?? '';
  const segment = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!segment || segment.includes('/')) return null;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const label = normalizeTenantSlug(decoded);
  if (!isValidTenantSlug(label) || isReservedSubdomain(label)) return null;
  return label;
}

/**
 * Redirect decision for a request host + path — pure host math, no DB, so it
 * stays unit-tested and Edge-safe.
 *
 * Two legacy→canonical shapes are recognised:
 *   1. `www.<slug>.<root>/…`  → `{ kind: 'host' }`   (301 to `<slug>.<root>/…`)
 *   2. `<root>/<slug>`        → `{ kind: 'apex-path' }` (301 to `<slug>.<root>`)
 *
 * Case 2 is only a CANDIDATE: the caller verifies the tenant actually exists
 * before issuing a permanent redirect (a 301 for a non-existent slug would be
 * cached by browsers/crawlers forever). Case 1 needs no lookup — the slug is
 * already a live, resolved host by construction.
 *
 * Returns null when the request is already canonical (`<slug>.<root>`), is a
 * platform route, or has nothing to redirect.
 */
export type TenantRedirect =
  | { kind: 'host'; host: string }
  | { kind: 'apex-path'; slug: string };

export function tenantRedirect(hostname: string, pathname: string): TenantRedirect | null {
  const host = normalizeHostname(hostname);

  // 1) www.<slug>.<root> → <slug>.<root> (same path; the apex form is canonical).
  if (host.startsWith('www.')) {
    const slug = tenantSlugFromHostname(host.slice('www.'.length));
    if (slug) return { kind: 'host', host: clinicSubdomain(slug) };
  }

  // 2) <root>/<slug> (and www.<root>/<slug>) → <slug>.<root>.
  if (host === TENANT_ROOT_DOMAIN || host === `www.${TENANT_ROOT_DOMAIN}`) {
    const slug = apexTenantSlugFromPath(pathname);
    if (slug) return { kind: 'apex-path', slug };
  }

  return null;
}

/**
 * Flat result shape (optional fields) — provisioning is best-effort and
 * callers read only what they need (`success` + `domain`/`error`). A
 * discriminated union forced narrowing gymnastics at every call site for no
 * practical gain; optional fields keep both success and failure payloads
 * expressible in one object.
 */
export type SubdomainResult = {
  success: boolean;
  /** Fully-qualified host, e.g. `hala-clinic.dentairec.com` (on success). */
  domain?: string;
  verified?: boolean;
  alreadyExisted?: boolean;
  /** Failure reason code/name, e.g. `INVALID_SLUG`, Vercel message. */
  error?: string;
  code?: string;
};

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

