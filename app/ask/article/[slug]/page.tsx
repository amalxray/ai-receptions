import type { Metadata } from 'next';
import Link from 'next/link';
import ShareButtons from '@/components/ask/ShareButtons';
import { notFound } from 'next/navigation';
import { getPublishedArticle, incrementArticleViews } from '@/lib/services/askContent';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const BASE = 'https://ai-receptions.vercel.app';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = (await getPublishedArticle(params.slug)) as Record<string, unknown> | null;
  if (!article) return { title: 'المقال غير موجود' };
  const img = (article.featured_image as { image_url?: string } | null)?.image_url ?? null;
  const title = String(article.title);
  const description = String(article.excerpt ?? '').slice(0, 160) || undefined;
  return {
    title: `${title} | سنّي`,
    description,
    keywords: (article.tags as string[] | null) ?? undefined,
    openGraph: { title, description, images: img ? [img, '/og/article-default.png'] : ['/og/article-default.png'], type: 'article', locale: 'ar_PS', siteName: 'سنّي' },
    twitter: { card: 'summary_large_image', title, description, images: [img, '/ask/api/og?title=' + encodeURIComponent(title) + '&type=article'].filter(Boolean) as string[] },
    alternates: { canonical: `${BASE}/ask/article/${params.slug}` },
  };
}

export default async function AskArticlePage({ params }: { params: { slug: string } }) {
  const article = (await getPublishedArticle(params.slug)) as Record<string, unknown> | null;
  if (!article) notFound();
  await incrementArticleViews(String(article.id));

  const img = (article.featured_image as { image_url?: string } | null)?.image_url ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: String(article.title),
            description: article.excerpt ?? undefined,
            image: img ?? undefined,
            author: { '@type': 'Organization', name: 'سنّي' },
            publisher: { '@type': 'Organization', name: 'سنّي', logo: { '@type': 'ImageObject', url: `${BASE}/icons/icon-192.png` } },
            datePublished: article.published_at ?? undefined,
            dateModified: article.updated_at ?? article.published_at ?? undefined,
          }),
        }}
      />
      <Link href="/ask/articles" className="text-sm text-cyan-400">← كل المقالات</Link>
      <h1 className="mt-4 text-3xl font-black">{String(article.title)}</h1>
      <p className="mt-2 text-xs text-slate-500">
        {String(article.category ?? 'عام')} · {String(article.published_at ?? '').slice(0, 10)} · {Number(article.view_count ?? 0)} مشاهدة
      </p>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={String(article.title)} className="mt-6 w-full rounded-2xl object-cover" />
      )}
      {article.excerpt ? <p className="mt-6 text-lg text-slate-300">{String(article.excerpt)}</p> : null}
      <div
        className="prose prose-invert mt-6 leading-8 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_li]:mr-4 [&_ol]:list-decimal [&_p]:mb-4 [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: String(article.content) }}
      />
      <div className="mt-8"><ShareButtons url={`/ask/article/${params.slug}`} title={`${String(article.title)} | سنّي`} /></div>
      <p className="mt-6 text-sm"><Link href="/ask" className="text-cyan-400">💬 استشارة ذكية جديدة</Link></p>
    </main>
  );
}