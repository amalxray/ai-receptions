import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'تواصل معنا — AI-Receptions' };

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">تواصل معنا</h1>
      <p className="mt-4 leading-8 text-slate-300">لأي استفسار أو دعم: راسلنا على البريد أو استخدم المساعد الذكي في الصفحة الرئيسية /ask وسنساعدك فوراً.</p>
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}
