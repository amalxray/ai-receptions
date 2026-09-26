import { NextResponse } from 'next/server';
import {
  buildPwaManifest,
  hostFromRequestHeaders,
  platformPwaManifest,
  resolvePwaBrand,
  type PwaManifest,
} from '@/lib/services/pwaManifest';
import { tenantSlugFromHostname } from '@/lib/vercel/domains';

/**
 * DYNAMIC WEB APP MANIFEST — one installable identity PER CLINIC.
 *
 * Replaces the static `public/manifest.json` (deleted) which pinned every tenant
 * subdomain to the platform name and icons.
 *
 *   https://amal-x-ray-center.dentairec.com/manifest.json
 *     → name "Amal X-Ray Center", short_name "Amal X-Ray", the clinic's
 *       theme_color on a `start_url` of "/" (same ORIGIN → its own app).
 *   https://www.dentairec.com/manifest.json            → platform manifest.
 *   https://www.dentairec.com/manifest.json?slug={s}   → the legacy `/c/{slug}`
 *     page brands itself this way (it renders a tenant on the apex origin).
 *
 * Node runtime: the brand read uses `supabaseAdmin` (service-role, server-only).
 * Never `force-static`: the answer depends on the request host, and branding must
 * follow an owner rename without a redeploy.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shared response shape — one place owns the caching/type contract. */
function manifestResponse(manifest: PwaManifest): NextResponse {
  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Host-dependent but never user-specific. Browser cache stays short so a
      // re-install reflects an owner rename; the edge may hold it longer.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const host = hostFromRequestHeaders(request.headers);
  const slugParam = new URL(request.url).searchParams.get('slug');

  const brand = await resolvePwaBrand({ host, slug: slugParam });
  if (!brand) {
    // Apex, dashboard, an unknown host or a DB hiccup → platform manifest.
    return manifestResponse(platformPwaManifest());
  }

  // A tenant host owns its origin: "/" is rewritten by the middleware to the
  // tenant space, so the installed app opens on the clinic's own page. The apex
  // compatibility page cannot install a tenant origin — it starts on its own
  // path, which then canonicalises to the subdomain.
  const onTenantHost = tenantSlugFromHostname(host) !== null;
  const legacyStart = `/c/${encodeURIComponent(brand.slug)}`;

  return manifestResponse(
    buildPwaManifest({
      slug: brand.slug,
      name: brand.name,
      logo: brand.logo,
      description: brand.description,
      theme: brand.theme,
      activityType: brand.activityType,
      startUrl: onTenantHost ? '/' : legacyStart,
      appId: onTenantHost ? '/' : legacyStart,
    })
  );
}
