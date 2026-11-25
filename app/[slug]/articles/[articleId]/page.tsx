import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { requestCache } from '@/lib/server/requestCache';
import { cleanClinicArticleTitle, stripClinicArticleMarkup } from '@/lib/services/clinicArticleText';

export const revalidate = 60;

const loadSpace = requestCache(getActivityPublicSpace);

type ArticlePageProps = { params: { slug: string; articleId: string } };

function findArticle(space: NonNullable<Awaited<ReturnType<typeof loadSpace>>>, articleId: string) {
  return space.articles.find((article) => article.id === articleId);
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const space = await loadSpace(params.slug);
  const article = space && findArticle(space, params.articleId);
  if (!space || !article) return { title: 'المقال غير موجود', robots: { index: false, follow: false } };

  const title = cleanClinicArticleTitle(article.title);
  return {
    title: `${title} — ${space.name}`,
    description: stripClinicArticleMarkup(article.content ?? '').slice(0, 160) || `مقال من ${space.name}.`,
    alternates: { canonical: `${space.pageUrl}/articles/${encodeURIComponent(article.id)}` },
    openGraph: {
      title,
      description: `مقال من ${space.name}.`,
      type: 'article',
      ...(article.image_url ? { images: [{ url: article.image_url, alt: title }] } : {}),
    },
  };
}

export default async function ClinicArticlePage({ params }: ArticlePageProps) {
  const space = await loadSpace(params.slug);
  if (!space) notFound();
  const article = findArticle(space, params.articleId);
  if (!article) notFound();

  const title = cleanClinicArticleTitle(article.title);
  const content = stripClinicArticleMarkup(article.content ?? '');
  const imageUrl = article.image_url || space.coverUrl || space.logo;

  return (
    <main dir="rtl" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav aria-label="مسار التنقل" className="mb-6 text-sm text-slate-500">
        <Link href={`/${params.slug}`} className="hover:text-emerald-700 hover:underline">
          {space.name}
        </Link>
        <span aria-hidden="true"> ← </span>
        <Link href={`/${params.slug}#articles`} className="hover:text-emerald-700 hover:underline">
          المقالات
        </Link>
        <span aria-hidden="true"> ← </span>
        <span aria-current="page">{title}</span>
      </nav>

      <article className="overflow-hidden rounded-3xl border border-emerald-100 bg-white/85 shadow-lg shadow-emerald-950/5 backdrop-blur">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="aspect-video w-full object-cover" />
        )}
        <div className="p-6 sm:p-10">
          {article.category && (
            <p className="mb-3 text-sm font-semibold text-emerald-700">{article.category}</p>
          )}
          <h1 className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{title}</h1>
          {article.published_at && (
            <time dateTime={article.published_at} className="mt-4 block text-sm text-slate-400">
              {new Intl.DateTimeFormat('ar', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(article.published_at))}
            </time>
          )}
          {content ? (
            <div className="mt-8 whitespace-pre-line text-base leading-8 text-slate-700">{content}</div>
          ) : (
            <p className="mt-8 text-slate-500">لا يتوفر نص إضافي لهذا المقال.</p>
          )}
          <Link
            href={`/${params.slug}#articles`}
            className="mt-10 inline-flex items-center gap-2 font-semibold text-emerald-700 transition-colors hover:text-cyan-700"
          >
            <span aria-hidden="true">→</span>
            العودة إلى مقالات العيادة
          </Link>
        </div>
      </article>
    </main>
  );
}
