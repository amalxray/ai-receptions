import type { Metadata } from 'next';
import QRCodeCard from '@/components/ask/QRCodeCard';
import ShareButtons from '@/components/ask/ShareButtons';

export const metadata: Metadata = { title: 'شارك سنّي — AI-Receptions' };

export default function AskQrPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-slate-950 px-4 py-12 text-slate-100" dir="rtl">
      <h1 className="text-center text-2xl font-black">📱 شارك سنّي</h1>
      <p className="mt-2 text-center text-slate-400">اسحب QR أو شارك الرابط مع مرضاك ليجدوا أقرب طبيب بسهولة.</p>
      <div className="mt-8 flex justify-center">
        <QRCodeCard url="/ask" label="اسأل سنّي — مساعدك الذكي" />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <ShareButtons url="/ask" title="سنّي — ابحث عن طبيب قريب منك" />
      </div>
    </main>
  );
}