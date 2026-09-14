'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

type AdminTopBarProps = {
  email: string;
  role: string;
};

const TITLES: { match: (p: string) => boolean; title: string; subtitle: string }[] = [
  { match: (p) => p === '/admin', title: 'نظرة عامة', subtitle: 'ملخص حي لأداء المنصة' },
  { match: (p) => p.startsWith('/admin/clinics'), title: 'المؤسسات', subtitle: 'إدارة العيادات والمراكز والمختبرات' },
  { match: (p) => p.startsWith('/admin/users'), title: 'المستخدمون', subtitle: 'حسابات المنصة وعضوياتها' },
  { match: (p) => p.startsWith('/admin/subscriptions'), title: 'الاشتراكات', subtitle: 'الحالة والتمديدات اليدوية' },
  { match: (p) => p.startsWith('/admin/notifications'), title: 'الإشعارات', subtitle: 'إرسال ومتابعة التنبيهات' },
  { match: (p) => p.startsWith('/admin/landing-page'), title: 'الصفحة الرئيسية', subtitle: 'تحرير نصوص وأقسام الموقع' },
  { match: (p) => p.startsWith('/admin/gallery'), title: 'المعرض', subtitle: 'صور المنصة والمحتوى' },
  { match: (p) => p.startsWith('/admin/articles'), title: 'المقالات', subtitle: 'محتوى /ask التحريري' },
  { match: (p) => p.startsWith('/admin/stories'), title: 'قصص النجاح', subtitle: 'شهادات وتجارب المرضى' },
  { match: (p) => p.startsWith('/admin/tips'), title: 'النصائح', subtitle: 'نصائح سريعة للمرضى' },
  { match: (p) => p.startsWith('/admin/faq'), title: 'الأسئلة الشائعة', subtitle: 'أسئلة وأجوبة /ask' },
  { match: (p) => p.startsWith('/admin/ask'), title: 'إعدادات /ask', subtitle: 'الهوية البصرية والنصوص' },
  { match: (p) => p.startsWith('/admin/settings'), title: 'الإعدادات', subtitle: 'معلومات تشغيل المنصة' },
];

function resolve(pathname: string) {
  return (
    TITLES.find((t) => t.match(pathname)) ?? {
      title: 'لوحة المالك',
      subtitle: 'إدارة منصة AI-Receptions',
    }
  );
}

export default function AdminTopBar({ email, role }: AdminTopBarProps) {
  const pathname = usePathname();
  const { title, subtitle } = resolve(pathname);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const render = () =>
      setClock(
        new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(new Date())
      );
    render();
    const id = setInterval(render, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 sm:inline-flex">
          <Activity className="h-3.5 w-3.5" />
          مباشر
        </span>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-left">
          <p className="max-w-[180px] truncate text-xs text-slate-300">{email}</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/70">
            {role}
            {clock ? ` · ${clock}` : ''}
          </p>
        </div>
      </div>
    </header>
  );
}
