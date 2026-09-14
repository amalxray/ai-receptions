import type { Metadata } from 'next';
import AskClient from '@/components/ask/AskClient';
import { getAskPageData } from '@/lib/services/askPageData';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getAskPageData();
  const hero = (settings.hero ?? {}) as { title?: string; subtitle?: string };
  const ogTitle = hero.title || 'سنّي — مساعدك الذكي';
  return {
    title: ogTitle,
    description: hero.subtitle || undefined,
    openGraph: {
      title: ogTitle,
      description: hero.subtitle || undefined,
      images: ['/og/default.png'],
      siteName: 'سنّي',
      locale: 'ar_PS',
      type: 'website',
      url: 'https://ai-receptions.vercel.app/ask',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description: hero.subtitle || undefined, images: ['/og/default.png'] },
    alternates: { canonical: 'https://ai-receptions.vercel.app/ask' },
  };
}

export default async function AskPage() {
  const { settings, tips, articles, stories, faq, clinics, gallery, stats } = await getAskPageData();
  const hero = (settings.hero ?? {}) as { title: string; subtitle: string; logo: string; assistant_name: string };
  const colors = (settings.colors ?? {}) as { primary?: string; secondary?: string; heading?: string; warning?: string };
  const sections = (settings.sections ?? {}) as Record<string, boolean>;
  const questions = (settings.questions ?? []) as string[];
  const on = (k: string) => sections[k] !== false;
  const published = (articles as Array<Record<string, unknown>>).filter((a) => a.slug);

  return <AskClient settings={settings} tips={tips} articles={articles} stories={stories} faq={faq} clinics={clinics} gallery={gallery} stats={stats} />;
}
