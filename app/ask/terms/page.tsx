import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'شروط الخدمة — AI-Receptions' };

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-2xl font-black">شروط الخدمة</h1>
      <p className="mt-4 leading-8 text-slate-300">باستخدامك المنصة: (١) المساعد الرقمي لا يقدم تشخيصاً طبياً بديلاً عن الطبيب. (٢) المواعيد ملزمة حسب سياسة كل عيادة. (٣) الاشتراك قابل للإيقاف في أي وقت حسب الباقة. (٤) نحتفظ بحق تحديث هذه الشروط مع إشعار مسبق.</p>
      <p className="mt-8 text-sm"><Link href="/ask" className="text-cyan-400">← رجوع إلى /ask</Link></p>
    </main>
  );
}
