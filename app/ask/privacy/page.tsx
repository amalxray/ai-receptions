import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'سياسة الخصوصية — AI-Receptions' };

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">سياسة الخصوصية</h1>
      <p className="mt-4 leading-8 text-slate-300">نحترم خصوصيتك: بياناتك تُستخدم فقط لتقديم الخدمة، مشفّرة ومحمية بنظام عزل بين العيادات (multi-tenant)، ولا تُشارك مع أي طرف ثالث دون موافقتك. الموقع الجغرافي يُستخدم فقط لإيجاد أقرب مركز، ولا يُخزَّن دون موافقتك.</p>
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}
