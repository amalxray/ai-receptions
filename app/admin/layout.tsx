import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getPlatformAdmin } from '@/lib/services/platformAdmin';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopBar from '@/components/admin/AdminTopBar';

export const dynamic = 'force-dynamic';

/**
 * PLATFORM ADMIN SHELL — server-guarded. Non-admin sessions are redirected to
 * login (next=/admin); viewers are bounced to /. The whole tree under /admin
 * inherits this layout, so every page is protected by the same check.
 *
 * Presentation: collapsible RTL sidebar (owner accent = amber) + top bar.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getPlatformAdmin();
  if (!admin) return redirect('/login?next=/admin');
  if (admin.role === 'viewer') return redirect('/');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {/* ambient owner glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AdminSidebar email={admin.email} role={admin.role} />
        <main className="min-w-0 flex-1 space-y-6">
          <AdminTopBar email={admin.email} role={admin.role} />
          {children}
        </main>
      </div>
    </div>
  );
}