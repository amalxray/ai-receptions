import type { Metadata } from 'next';
import Link from 'next/link';
import { listActiveFaq } from '@/lib/services/askContent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الأسئلة الشائعة — AI-Receptions' };

export default async function AskFaqPage() {
  const faq = await listActiveFaq();
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">❓ الأسئلة الشائعة</h1>
      {faq.length === 0 ? (
        <p className="mt-6 text-slate-500">لا توجد أسئلة بعد.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {(faq as Array<Record<string, unknown>>).map((f) => (
            <details key={String(f.id)} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-100">{String(f.question)}</summary>
              <p className="mt-2 text-sm leading-6 text-slate-400">{String(f.answer)}</p>
            </details>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}