import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'عن المنصة — AI-Receptions' };

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">عن المنصة</h1>
      <p className="mt-4 leading-8 text-slate-300">AI-Receptions منصة تصل المرضى بأقرب عيادة/مركز أسنان بذكاء اصطناعي يفهم لهجتك — يرد ٢٤/٧، يجمع معلوماتك، ويحجز لك في أقرب متاح.</p>
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}
