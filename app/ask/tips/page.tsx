import type { Metadata } from 'next';
import Link from 'next/link';
import { listActiveTips } from '@/lib/services/askContent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'النصائح — AI-Receptions' };

export default async function AskTipsPage() {
  const tips = await listActiveTips();
  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">💡 نصائح صحية</h1>
      {tips.length === 0 ? (
        <p className="mt-6 text-slate-500">لا توجد نصائح بعد.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(tips as Array<Record<string, unknown>>).map((t) => (
            <div key={String(t.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-2xl">{String(t.icon ?? '💡')}</p>
              <p className="mt-2 font-bold text-slate-100">{String(t.title)}</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">{String(t.content)}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}