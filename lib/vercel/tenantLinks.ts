/**
 * P1 — TENANT PUBLIC URLS WITH A READINESS FALLBACK.
 *
 * `clinicSpaceUrl` (`https://{slug}.dentairec.com`) is the canonical tenant
 * identity, but it is only USABLE once the host is registered on the Vercel
 * project. A tenant whose provisioning failed (best-effort during registration,
 * every error swallowed) would otherwise be handed a URL whose TLS handshake
 * aborts — in canonical tags, QR redirects, sitemap and /ask links alike.
 *
 * This module is the single place that answers "where do I send this patient /
 * crawler / clinic right now?":
 *   ready     → the canonical subdomain (Vercel-authoritative, cached 60s)
 *   not ready → the compatibility page `/c/{slug}`, which renders the same
 *               tenant, is reachable today, and is noindex + canonical to the
 *               subdomain as soon as it becomes ready.
 *
 * Readiness is cached per listing (not per slug), so a batch of tenants costs
 * ONE Vercel call — see `lib/vercel/subdomainReadiness.ts`.
 */
import { getAppBaseUrl } from '@/lib/communications/links';
import { clinicSpaceUrl } from '@/lib/vercel/domains';
import { isSubdomainIn, readVercelProjectDomainNames } from '@/lib/vercel/subdomainReadiness';

/**
 * Compatibility page for a tenant (`https://www.dentairec.com/c/{slug}`).
 *
 * Deliberately built from `getAppBaseUrl()` (the platform origin) rather than a
 * hardcoded production host, so staging/preview deployments keep pointing at
 * themselves.
 */
export function tenantSpaceFallbackUrl(
  slug: string,
  env: Record<string, string | undefined> = process.env
): string {
  return `${getAppBaseUrl(env)}/c/${encodeURIComponent(slug)}`;
}

/**
 * PURE decision: `subdomainReady` → canonical subdomain, else the fallback page.
 * Exported separately so the rule is unit-testable without any network.
 */
export function tenantPublicUrl(
  slug: string,
  subdomainReady: boolean,
  env: Record<string, string | undefined> = process.env
): string {
  return subdomainReady ? clinicSpaceUrl(slug) : tenantSpaceFallbackUrl(slug, env);
}

/** Single-tenant resolution (canonical tag, QR redirect, JSON-LD `url`). */
export async function resolveTenantPublicUrl(
  slug: string,
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  const names = await readVercelProjectDomainNames();
  return tenantPublicUrl(slug, isSubdomainIn(names, slug), env);
}

/**
 * Batch resolution — `/ask`, the sitemap and any list surface. ONE Vercel
 * listing answers every slug, so a 40-tenant sitemap is not 40 lookups.
 */
export async function resolveTenantPublicUrls(
  slugs: string[],
  env: Record<string, string | undefined> = process.env
): Promise<Map<string, string>> {
  const names = await readVercelProjectDomainNames();
  const resolved = new Map<string, string>();
  for (const slug of slugs) {
    resolved.set(slug, tenantPublicUrl(slug, isSubdomainIn(names, slug), env));
  }
  return resolved;
}
