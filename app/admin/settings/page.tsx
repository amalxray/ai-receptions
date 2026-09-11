'use client';

export default function AdminSettingsPage() {
  const info = [
    ['👑 دور المالك', 'owner'],
    ['🎭 Worker', '—'],
    ['🌐 البيئة', 'Production (Vercel)'],
    ['🗄️ قاعدة البيانات', 'Supabase'],
    ['💳 التمويل', 'Stripe (test mode)'],
    ['📧 الإشعارات', 'Resend'],
  ];

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">⚙️ إعدادات المنصة</h2>
      <p className="mt-1 text-sm text-slate-400">معلومات التشغيل الحالية للمنصة.</p>

      <ul className="mt-5 divide-y divide-slate-800">
        {info.map(([key, value]) => (
          <li key={key} className="flex items-center justify-between py-3 text-sm">
            <span className="text-slate-300">{key}</span>
            <span className="text-slate-400">{value}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-slate-300">
        <p className="font-semibold text-amber-200">ملاحظة أمان</p>
        <p className="mt-1 leading-6">
          إعدادات المحتوى والتفعيل الخاص بالمنصة تُدار من الصفحات المجاورة
          (المؤسسات، المستخدمون، الاشتراكات، الإشعارات). لا تُعرض الأسرار هنا.
        </p>
      </div>
    </div>
  );
}