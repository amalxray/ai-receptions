import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { buildClinicSchema, sanitizePublicSocialLinks } from '@/lib/services/doctorJsonLd';
import { getActivityPublicSpace, type ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { brandMetadataIcons, PLATFORM_VIEWPORT } from '@/lib/services/pwaManifest';
import { requestCache } from '@/lib/server/requestCache';
import { ClinicPublicSpace } from '@/components/public/ClinicPublicSpace';
import { ImagingPublicSpace } from '@/components/public/ImagingPublicSpace';
import { DentalLabPublicSpace } from '@/components/public/DentalLabPublicSpace';
import InstallPWA from '@/components/pwa/InstallPWA';

/**
 * LEGACY compatibility page: /c/{slug}
 *
 * This surface must render the same dynamic activity-space content as the
 * canonical public route so the saved theme and media values are reflected in
 * the served HTML instead of hardcoded legacy styling.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export type ClinicPublicPageProps = { params: { slug: string } };

const loadSpace = requestCache(getActivityPublicSpace);

export async function generateMetadata({ params }: ClinicPublicPageProps): Promise<Metadata> {
  const space = await loadSpace(params.slug);
  if (!space) {
    return { title: 'العيادة غير موجودة', robots: { index: false, follow: false } };
  }

  const description = space.description ?? `${space.name} — ${space.city ?? ''} ${space.area ?? ''}`.trim();
  return {
    title: space.name,
    description,
    applicationName: space.name,
    appleWebApp: { capable: true, title: space.name, statusBarStyle: 'default' },
    icons: brandMetadataIcons(space.logo),
    manifest: `/manifest.json?slug=${encodeURIComponent(params.slug)}`,
    robots: { index: false, follow: false },
    openGraph: {
      title: space.name,
      description,
      type: 'website',
      siteName: space.name,
      url: space.pageUrl,
    },
    alternates: { canonical: space.pageUrl },
  };
}

export async function generateViewport({ params }: ClinicPublicPageProps): Promise<Viewport> {
  const space = await loadSpace(params.slug);
  if (!space) return PLATFORM_VIEWPORT;
  return { ...PLATFORM_VIEWPORT, themeColor: space.theme.primary_color };
}

function buildSpaceJsonLd(space: ActivityPublicSpace) {
  const sameAs = sanitizePublicSocialLinks(space.socialLinks);
  const schema = buildClinicSchema({
    name: space.name,
    pageUrl: space.pageUrl,
    description: space.description,
    logo: space.logo,
    phone: space.phone ?? undefined,
    city: space.city,
    area: space.area,
    address: space.address,
    socialLinks: space.socialLinks,
    services: space.services,
    openingHours: space.workingHours,
  });

  if (sameAs.length > 0) schema.sameAs = sameAs;
  if (space.activityType === 'dental_lab') schema['@type'] = 'MedicalBusiness';
  return JSON.stringify(schema).replace(/</g, '\u003c');
}

export default async function LegacyClinicPublicPage({ params }: ClinicPublicPageProps) {
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