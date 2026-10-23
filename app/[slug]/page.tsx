import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { getActivityPublicSpace, type ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { brandMetadataIcons, PLATFORM_VIEWPORT } from '@/lib/services/pwaManifest';
import { requestCache } from '@/lib/server/requestCache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildClinicSchema, sanitizePublicSocialLinks } from '@/lib/services/doctorJsonLd';
import {
  buildClinicReviewsJsonLd,
  getClinicReviewsForPublic,
  getClinicReviewsStats,
} from '@/lib/services/reviewsService';
import ReviewsSection from '@/components/public/ReviewsSection';
import { ClinicPublicSpace } from '@/components/public/ClinicPublicSpace';
import { ImagingPublicSpace } from '@/components/public/ImagingPublicSpace';
import { DentalLabPublicSpace } from '@/components/public/DentalLabPublicSpace';
import InstallPWA from '@/components/pwa/InstallPWA';
import PublicServicesCard from '@/components/public/PublicServicesCard';

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

/**
 * Public tenant profiles change occasionally and are slow to assemble from
 * several database reads. Serve cached HTML and refresh it at most every
 * 30 seconds, matching the platform landing page's freshness window.
 */
export const revalidate = 30;

export type ActivitySpacePageProps = { params: { slug: string } };

/** Build tenant pages on first visit and cache each slug independently. */
export async function generateStaticParams(): Promise<ActivitySpacePageProps['params'][]> {
  return [];
}

/**
 * Request-scoped memoization (`lib/server/requestCache`) — `generateMetadata`,
 * `generateViewport` and the page render in ONE request, and the space costs
 * several queries. Without it the resolver runs three times while generating a
 * page, even though the generated HTML is cached between visits.
 */
const loadSpace = requestCache(getActivityPublicSpace);

/**
 * PHASE 2 — reviews (stats + latest items) memoized for ONE request; the
 * service itself keeps a 5-min TTL cache, so ISR (revalidate=30) stays cheap.
 */
const loadReviews = requestCache(async (clinicId: string) => {
  const [stats, items] = await Promise.all([
    getClinicReviewsStats(clinicId),
    getClinicReviewsForPublic(clinicId),
  ]);
  return { stats, items };
});

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
      // Phase 5 — per-clinic OG image (logo) + locale for social previews.
      ...(space.logo ? { images: [{ url: space.logo, alt: space.name }] } : {}),
      locale: 'ar_PS',
    },
    twitter: {
      card: 'summary',
      title: space.name,
      description,
      ...(space.logo ? { images: [space.logo] } : {}),
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
 *  center) or MedicalBusiness (dental lab), built ONLY from public fields.
 *  PHASE 2 — when the clinic reached the review threshold its AggregateRating
 *  and latest reviews are merged in (null below threshold → nothing added). */
function buildSpaceJsonLd(
  space: ActivityPublicSpace,
  reviews: Awaited<ReturnType<typeof loadReviews>> | null
) {
  const shared = {
    name: space.name,
    pageUrl: space.pageUrl,
    slug: space.slug,
    description: space.description,
    tagline: space.tagline,
    logo: space.logo,
    phone: space.phone,
    city: space.city,
    area: space.area,
    address: space.address,
    latitude: space.latitude,
    longitude: space.longitude,
    socialLinks: space.socialLinks,
    services: space.services,
    openingHours: space.workingHours,
  };

  const sameAs = sanitizePublicSocialLinks(space.socialLinks);
  const schema = buildClinicSchema({
    ...shared,
    socialLinks: space.socialLinks,
    services: space.services,
    openingHours: space.workingHours,
  });

  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  if (space.activityType === 'dental_lab') {
    schema['@type'] = 'MedicalBusiness';
  }

  // PHASE 2 — AggregateRating + review nodes (null below the ≥5 threshold).
  if (reviews) {
    const reviewsLd = buildClinicReviewsJsonLd({
      clinic: { name: space.name, url: space.pageUrl },
      stats: reviews.stats,
      items: reviews.items,
    });
    if (reviewsLd) Object.assign(schema, reviewsLd);
  }

  return JSON.stringify(schema).replace(/</g, '\u003c');
}

export default async function ActivitySpacePage({ params }: ActivitySpacePageProps) {
  const space = await loadSpace(params.slug);
  if (!space) {
    notFound();
  }
  const servicesTable =
    space.activityType === 'imaging_center' ? 'imaging_services' :
    space.activityType === 'dental_lab' ? 'lab_services' :
    'clinic_services';

  const [reviews, servicesResult] = await Promise.all([
    loadReviews(space.clinicId),
    supabaseAdmin
      .from(servicesTable)
      .select('name, price, price_min, price_max, duration_minutes, description')
      .eq('clinic_id', space.clinicId)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(6),
  ]);
  const { data: services } = servicesResult;

  const jsonLd = buildSpaceJsonLd(space, reviews);
  const schemaScript = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
  const servicesCard = (
    <PublicServicesCard
      sectionKey="clinic_services"
      services={services ?? []}
      activityType={space.activityType}
    />
  );
  // PHASE 2 — patient reviews block under the space (all activity types).
  // Phase 3b — viewAllHref links to /{slug}/reviews when total > 5.
  const reviewsSection = (
    <ReviewsSection clinicName={space.name} clinicSlug={params.slug} stats={reviews.stats} items={reviews.items} viewAllHref={`/${params.slug}/reviews`} />
  );
  // PWA — every activity space renders the same self-hiding install banner.
  switch (space.activityType) {
    case 'imaging_center':
      return (
        <>
          {schemaScript}
          <ImagingPublicSpace space={space} servicesCard={servicesCard} />
          {reviewsSection}
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    case 'dental_lab':
      return (
        <>
          {schemaScript}
          <DentalLabPublicSpace space={space} servicesCard={servicesCard} />
          {reviewsSection}
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    default:
      return (
        <>
          {schemaScript}
          <ClinicPublicSpace space={space} servicesCard={servicesCard} />
          {reviewsSection}
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
  }
}
