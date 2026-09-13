import type { Metadata } from 'next';
import Link from 'next/link';
import { listActiveStories } from '@/lib/services/askContent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'قصص النجاح — AI-Receptions' };

export default async function AskStoriesPage() {
  const stories = await listActiveStories();
  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">💚 قصص النجاح</h1>
      {stories.length === 0 ? (
        <p className="mt-6 text-slate-500">لا توجد قصص بعد.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(stories as Array<Record<string, unknown>>).map((s) => (
            <div key={String(s.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              {typeof s.image_url === 'string' && s.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt={String(s.patient_name)} className="mb-3 h-32 w-full rounded-xl object-cover" loading="lazy" />
              )}
              <p className="text-amber-400">{'★'.repeat(Number(s.rating ?? 5))}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{String(s.content)}</p>
              <p className="mt-3 text-xs font-bold text-slate-200">— {String(s.patient_name)}{s.patient_city ? ` · ${String(s.patient_city)}` : ''}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}