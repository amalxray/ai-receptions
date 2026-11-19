import type { Metadata } from 'next';
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';

type ClinicSocialMetadataInput = {
  title: string;
  description: string;
  url: string;
  clinicName: string;
  logoUrl: string | null;
};

const DEFAULT_SOCIAL_IMAGE = `${PRODUCTION_BASE_URL}/og-image.png`;
const DEFAULT_SOCIAL_IMAGE_ALT = 'AI-Receptions — موظفة الاستقبال الرقمية لعيادتك';

export function buildClinicSocialMetadata({
  title,
  description,
  url,
  clinicName,
  logoUrl,
}: ClinicSocialMetadataInput): Pick<Metadata, 'openGraph' | 'twitter'> {
  const imageUrl = logoUrl ?? DEFAULT_SOCIAL_IMAGE;
  const imageAlt = logoUrl ? clinicName : DEFAULT_SOCIAL_IMAGE_ALT;

  return {
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: clinicName,
      locale: 'ar_PS',
      images: [{ url: imageUrl, alt: imageAlt }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [imageUrl],
    },
  };
}
