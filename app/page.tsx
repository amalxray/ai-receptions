import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';
import { LandingContentProvider } from '@/components/landing/LandingContent';
import { getLandingPageContent } from '@/lib/services/landingContent';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** ISR — CMS edits from /admin/landing-page go live within 30 seconds. */
export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const copy = (await getLandingPageContent()) as {
    seo?: { title?: string; description?: string; og_image?: string };
    brand?: { name?: string; tagline?: string };
  };
  const title = copy.seo?.title?.trim() ||
    `${copy.brand?.name ?? 'AI-Receptions'} — ${copy.brand?.tagline ?? 'موظفة الاستقبال الرقمية لعيادتك'}`;
  const description = copy.seo?.description?.trim() || undefined;
  const ogImage = copy.seo?.og_image?.trim() || undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

export default async function Home() {
  const [copy, { data: galleryImages }] = await Promise.all([
    getLandingPageContent(),
    supabaseAdmin.from('platform_gallery').select('id, title, image_url, category').eq('is_active', true).order('sort_order', { ascending: true }).limit(12),
  ]);
  return (
    <LandingContentProvider copy={copy}>
      <LandingPage galleryImages={galleryImages ?? []} />
    </LandingContentProvider>
  );
}
