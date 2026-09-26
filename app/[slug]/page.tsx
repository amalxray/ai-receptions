import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { getActivityPublicSpace, type ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { getAppBaseUrl } from '@/lib/communications/links';
import { brandMetadataIcons, PLATFORM_VIEWPORT } from '@/lib/services/pwaManifest';
import { requestCache } from '@/lib/server/requestCache';
import { ClinicPublicSpace } from '@/components/public/ClinicPublicSpace';
import { ImagingPublicSpace } from '@/components/public/ImagingPublicSpace';
import { DentalLabPublicSpace } from '@/components/public/DentalLabPublicSpace';
import InstallPWA from '@/components/pwa/InstallPWA';

/**
 * Digital Healthcare Space — CANONICAL public space route (Phase E).
 *
 *   /{slug}  →  resolve tenant  →  activity_type  →
 *               activity-specific public space (Clinic / Imaging / Dental Lab)
 *
 * Legacy `/c/{slug}` remains a compatibility route (no longer canonical):
 * it renders the same tenant but with canonical → /{slug} + robots noindex,
 * so the canonical identity consolidates here without breaking existing links.
 *
 * Shared tenant identity (clinics.activity_type) is the single discriminator.
 * Domain catalogs (imaging_services/lab_services) are additive & tenant-scoped.
 */

export const dynamic = 'force-dynamic';
/** Live content guarantee: the space service reads owner-managed news/media/
 *  content via supabase-js (fetch under the hood) — force-no-store disables the
 *  Next.js Data Cache so every /{slug} request reflects the DB as of NOW. */
export const fetchCache = 'force-no-store';

export type ActivitySpacePageProps = { params: { slug: string } };

/**
 * Request-scoped memoization (`lib/server/requestCache`) — `generateMetadata`,
 * `generateViewport` and the page render in ONE request, and the space costs
 * several queries. Without it the resolver runs three times per visit (the module
 * is `force-no-store`, so nothing else dedupes it).
 */
const loadSpace = requestCache(getActivityPublicSpace);

export async function generateMetadata({ params }: ActivitySpacePageProps): Promise<Metadata> {
  const space = await loadSpace(params.slug);
  if (!space) {
    return { title: 'غير موجودة', robots: { index: false, follow: false } };
  }
  // `space.pageUrl` is readiness-resolved by the service (P1): the tenant
  // subdomain when its host is registered on the Vercel project, else the
  // reachable `/c/{slug}` compatibility page. A canonical tag must point at a
  // URL a crawler can actually fetch, so the service value is reused verbatim
  // (single lookup — canonical, og:url and JSON-LD can never disagree).
  const canonical = space.pageUrl;
  const description =
    space.description ??
    `${space.name} — ${space.city ?? ''} ${space.area ?? ''}`.trim();
  return {
    title: space.name,
    description,
    // PWA install identity = THIS clinic, not the platform: Android/Chrome read
    // the host-resolved `/manifest.json`, iOS reads the tags below — Safari never
    // reads a manifest for "Add to Home Screen" (see `brandMetadataIcons`).
    applicationName: space.name,
    appleWebApp: { capable: true, title: space.name, statusBarStyle: 'default' },
    icons: brandMetadataIcons(space.logo),
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: space.name,
      description,
      type: 'website',
      url: canonical,
      siteName: space.name,
    },
  };
}

/**
 * PWA — the standalone status bar / iOS theme color carries the CLINIC's primary
 * color (the same bounded theme the page renders), not the platform emerald.
 * Everything else is inherited from PLATFORM_VIEWPORT (#40 mobile contract).
 */
export async function generateViewport({ params }: ActivitySpacePageProps): Promise<Viewport> {
  const space = await loadSpace(params.slug);
  if (!space) return PLATFORM_VIEWPORT;
  return { ...PLATFORM_VIEWPORT, themeColor: space.theme.primary_color };
}

/** AEO/GEO — per-tenant structured data: MedicalClinic (clinic / imaging
 *  center) or MedicalBusiness (dental lab), built ONLY from public fields. */
function buildSpaceJsonLd(space: ActivityPublicSpace) {
  const base = getAppBaseUrl();
  const social = Object.values(space.socialLinks ?? {}).filter((v): v is string => Boolean(v));
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    // activity_type is the single discriminator (Digital Healthcare Space):
    '@type': space.activityType === 'dental_lab' ? 'MedicalBusiness' : 'MedicalClinic',
    name: space.name,
    url: space.pageUrl,
    ...(space.description ? { description: space.description } : {}),
    ...(space.tagline ? { slogan: space.tagline } : {}),
    ...(space.logo ? { image: space.logo } : {}),
    ...(space.city || space.area || space.address
      ? {
          address: {
            '@type': 'PostalAddress',
            addressCountry: 'PS',
            ...(space.city ? { addressLocality: space.city } : {}),
            ...(space.area ? { addressRegion: space.area } : {}),
            ...(space.address ? { streetAddress: space.address } : {}),
          },
        }
      : {}),
    ...(space.phone ? { telephone: space.phone } : {}),
    areaServed: { '@type': 'AdministrativeArea', name: 'فلسطين' },
    ...(space.activityType === 'imaging_center'
      ? { medicalSpecialty: 'Radiology' }
      : space.activityType === 'clinic'
        ? { medicalSpecialty: 'Dentistry' }
        : {}),
    ...(social.length > 0 ? { sameAs: social } : {}),
    knowsLanguage: ['ar', 'en'],
  };
  return JSON.stringify(node).replace(/</g, '\\u003c');
}

export default async function ActivitySpacePage({ params }: ActivitySpacePageProps) {
  const space = await loadSpace(params.slug);
  if (!space) {
    notFound();
  }
  const jsonLd = buildSpaceJsonLd(space);
  const schemaScript = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
  // PWA — every activity space renders the same self-hiding install banner.
  switch (space.activityType) {
    case 'imaging_center':
      return (
        <>
          {schemaScript}
          <ImagingPublicSpace space={space} />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    case 'dental_lab':
      return (
        <>
          {schemaScript}
          <DentalLabPublicSpace space={space} />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    default:
      return (
        <>
          {schemaScript}
          <ClinicPublicSpace space={space} />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
  }
}