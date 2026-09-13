import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublishedArticles } from '@/lib/services/askContent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'المقالات — AI-Receptions' };

export default async function AskArticlesPage() {
  const articles = await listPublishedArticles({ limit: 50 });
  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">📝 المقالات</h1>
      {articles.length === 0 ? (
        <p className="mt-6 text-slate-500">لا توجد مقالات منشورة بعد.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(articles as Array<Record<string, unknown>>).map((a) => (
            <Link key={String(a.id)} href={'/ask/article/' + a.slug} className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40">
              <p className="font-bold group-hover:text-cyan-300">{String(a.title)}</p>
              {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-400">{String(a.excerpt)}</p> : null}
              <p className="mt-2 text-xs text-slate-500">{String(a.category ?? 'عام')} · {String(a.published_at ?? '').slice(0, 10)}</p>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}