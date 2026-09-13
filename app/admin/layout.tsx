import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getPlatformAdmin } from '@/lib/services/platformAdmin';

export const dynamic = 'force-dynamic';

const ADMIN_LINKS = [
  { href: '/admin', label: '📊 نظرة عامة' },
  { href: '/admin/clinics', label: '🏢 المؤسسات' },
  { href: '/admin/users', label: '👥 المستخدمون' },
  { href: '/admin/subscriptions', label: '💳 الاشتراكات' },
  { href: '/admin/notifications', label: '📢 الإشعارات' },
  { href: '/admin/landing-page', label: '🌐 الصفحة الرئيسية' },
  { href: '/admin/gallery', label: '🖼️ المعرض' },
  { href: '/admin/settings', label: '⚙️ الإعدادات' },
];

const ASK_LINKS = [
  { href: '/admin/articles', label: '📝 المقالات' },
  { href: '/admin/stories', label: '💚 قصص النجاح' },
  { href: '/admin/tips', label: '💡 النصائح' },
  { href: '/admin/faq', label: '❓ الأسئلة الشائعة' },
  { href: '/admin/ask', label: '🎨 إعدادات /ask' },
];

/**
 * PLATFORM ADMIN SHELL — server-guarded. Non-admin sessions are redirected to
 * login (next=/admin); viewers are bounced to /. The whole tree under /admin
 * inherits this layout, so every page is protected by the same check.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) return redirect('/login?next=/admin');
  if (admin.role === 'viewer') return redirect('/');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-amber-500/30 bg-slate-900/80 p-6 shadow-xl shadow-amber-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300/90">👑 لوحة تحكم المالك</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">AI-Receptions — إدارة المنصة</h1>
            <p className="mt-1 text-sm text-slate-400">{admin.email} · دور {admin.role}</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm text-slate-200 transition hover:border-amber-400/70">
            العودة للموقع
          </Link>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[2rem] border border-amber-500/20 bg-slate-900/90 p-5 font-medium">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">تنقل المالك</p>
            <nav className="mt-4 space-y-1 text-sm">
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3 py-2 text-slate-200 transition hover:bg-slate-800/80 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-amber-200/70">محتوى /ask</p>
              {ASK_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3 py-2 text-slate-200 transition hover:bg-slate-800/80 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
          <section className="space-y-6">{children}</section>
        </div>
      </div>
    </div>
  );
}