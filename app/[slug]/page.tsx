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
import { PUBLIC_SECTION_ORDER_KEYS } from '@/lib/services/clinicPublicConfig';
import ReviewsSection from '@/components/public/ReviewsSection';
import { ClinicPublicSpace } from '@/components/public/ClinicPublicSpace';
import { ImagingPublicSpace } from '@/components/public/ImagingPublicSpace';
import { DentalLabPublicSpace } from '@/components/public/DentalLabPublicSpace';
import InstallPWA from '@/components/pwa/InstallPWA';
import PublicServicesCard from '@/components/public/PublicServicesCard';
import BookIn30Button from '@/components/public/BookIn30Button';
import QuickClinicChat from '@/components/public/QuickClinicChat';

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

export const revalidate = 0;

export type ActivitySpacePageProps = { params: { slug: string } };

/**
 * Request-scoped memoization (`lib/server/requestCache`) — `generateMetadata`,
 * `generateViewport` and the page render in ONE request, and the space costs
 * several queries. Without it the resolver runs three times per visit (the module
 * is `force-no-store`, so nothing else dedupes it).
 */
const loadSpace = requestCache(getActivityPublicSpace);

/**
 * PHASE 2 — reviews (stats + latest items) memoized for ONE request; the
 * service itself keeps a 5-min TTL cache, so ISR (revalidate=60) stays cheap.
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
  const reviews = await loadReviews(space.clinicId);

  const servicesTable =
    space.activityType === 'imaging_center' ? 'imaging_services' :
    space.activityType === 'dental_lab' ? 'lab_services' :
    'clinic_services';

  const { data: services } = await supabaseAdmin
    .from(servicesTable)
    .select('name, price, price_min, price_max, duration_minutes, description')
    .eq('clinic_id', space.clinicId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(6);

  const jsonLd = buildSpaceJsonLd(space, reviews);
  const schemaScript = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
  // PHASE 2 — patient reviews block under the space (all activity types).
  // Phase 3b — viewAllHref links to /{slug}/reviews when total > 5.
  const reviewsSection = (
    <ReviewsSection clinicName={space.name} clinicSlug={params.slug} stats={reviews.stats} items={reviews.items} viewAllHref={`/${params.slug}/reviews`} />
  );
  /**
   * كتلة «بطاقة الخدمات والحجز» (المعرف `clinic_services` في ترتيب الأقسام).
   * تُعرض المجموعة الموحّدة (بطاقة الخدمات + زر الحجز في 30 ثانية +
   * المحادثة المضغوطة) وفق موضعها في `space.sectionOrder`. عند عدم وجود
   * ترتيب مخصص، تظهر الكتلة أول الصفحة لأن `DEFAULT_PUBLIC_SECTION_ORDER`
   * تبدأ بـ `clinic_services`.
   */
  function ServicesBookingBlock({
    space: blockSpace,
    services: blockServices,
  }: {
    space: ActivityPublicSpace;
    services: { name: string; price: number | null }[];
  }) {
    return (
      <>
        <PublicServicesCard
          services={blockServices}
          activityType={blockSpace.activityType}
        />
        <div className="text-center">
          <BookIn30Button clinicId={blockSpace.clinicId} />
        </div>
        <QuickClinicChat clinicId={blockSpace.clinicId} mode="compact" />
      </>
    );
  }

  // كتل الصفحة العليا حسب ترتيب الأقسام المحفوظ؛ كل قسم apart من
  // clinic_services يُمَثَّل بمساحة العيادة الرئيسية (ClinicPublicSpace).
  type PageBlock = 'clinic_services' | 'clinic_main';
  const pageBlocks: PageBlock[] = [];
  const seenBlocks = new Set<PageBlock>();
  for (const key of (Array.isArray(space.sectionOrder)
    ? space.sectionOrder
    : []).filter((k): k is (typeof PUBLIC_SECTION_ORDER_KEYS)[number] =>
      typeof k === 'string' &&
      PUBLIC_SECTION_ORDER_KEYS.includes(k as (typeof PUBLIC_SECTION_ORDER_KEYS)[number]),
    )) {
    const block: PageBlock = key === 'clinic_services' ? 'clinic_services' : 'clinic_main';
    if (!seenBlocks.has(block)) {
      seenBlocks.add(block);
      pageBlocks.push(block);
    }
  }
  // عندما لا يُحدّد ترتيب مخصص، تظهر بطاقة الخدمات والحجز أول الصفحة
  // (DEFAULT_PUBLIC_SECTION_ORDER تبدأ بـ clinic_services).
  if (!seenBlocks.has('clinic_services')) pageBlocks.push('clinic_services');
  if (!seenBlocks.has('clinic_main')) pageBlocks.push('clinic_main');

  // PWA — every activity space renders the same self-hiding install banner.
  switch (space.activityType) {
    case 'imaging_center':
      return (
        <>
          {schemaScript}
          {pageBlocks.map((block) => (
            <div key={block} style={{ display: 'contents' }}>
              {block === 'clinic_services' ? (
                <ServicesBookingBlock space={space} services={services ?? []} />
              ) : (
                <ImagingPublicSpace space={space} />
              )}
            </div>
          ))}
          {reviewsSection}
          <QuickClinicChat clinicId={space.clinicId} mode="inline" />
          <QuickClinicChat clinicId={space.clinicId} mode="floating" />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    case 'dental_lab':
      return (
        <>
          {schemaScript}
          {pageBlocks.map((block) => (
            <div key={block} style={{ display: 'contents' }}>
              {block === 'clinic_services' ? (
                <ServicesBookingBlock space={space} services={services ?? []} />
              ) : (
                <DentalLabPublicSpace space={space} />
              )}
            </div>
          ))}
          {reviewsSection}
          <QuickClinicChat clinicId={space.clinicId} mode="inline" />
          <QuickClinicChat clinicId={space.clinicId} mode="floating" />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
    default:
      return (
        <>
          {schemaScript}
          {pageBlocks.map((block) => (
            <div key={block} style={{ display: 'contents' }}>
              {block === 'clinic_services' ? (
                <ServicesBookingBlock space={space} services={services ?? []} />
              ) : (
                <ClinicPublicSpace space={space} />
              )}
            </div>
          ))}
          {reviewsSection}
          <QuickClinicChat clinicId={space.clinicId} mode="inline" />
          <QuickClinicChat clinicId={space.clinicId} mode="floating" />
          <InstallPWA variant="floating" appName={space.name} />
        </>
      );
  }
}