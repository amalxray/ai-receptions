import type { ReactNode } from 'react';
import DashboardAuthGuard from '@/components/auth/DashboardAuthGuard';
import DashboardHeader from '@/components/auth/DashboardHeader';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { ToastViewport } from '@/components/ui/Toast';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * TENANT-ISOLATED DASHBOARD — Arabic shell for every dashboard route.
 *
 * N29 — the 280px sidebar column is gone: navigation now lives in the sticky top
 * bar (four colour-coded tabs + a bento grid per tab, one entry point per module).
 * The module list itself is unchanged (32 modules, activity-aware, role- and
 * plan-gated) — only WHERE it renders moved.
 *
 * `DashboardSidebar` / `DashboardMobileNav` are kept in the tree (nothing was
 * deleted) but are no longer mounted here: the top bar is responsive and keeps
 * every module reachable on phones, and the tenant switcher moved into it.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardAuthGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-[2rem] border border-amber-500/30 bg-amber-500/10 p-4 text-right text-sm text-amber-100 shadow-lg shadow-amber-900/20">
              <p className="font-semibold text-amber-200">التطبيق يعمل في وضع العرض التجريبي المحلي.</p>
              <p className="mt-1 text-slate-200">
                لتشغيل الإصدار الحقيقي، أضف مفاتيح Supabase في <span className="font-semibold">.env.local</span> ثم أعد تشغيل التطبيق.
              </p>
            </div>
          )}

          <DashboardHeader />

          {/* N29 — sticky top bar: identity + tenant switcher + the 4-tab bento nav. */}
          <DashboardTopNav />

          <section className="space-y-6">{children}</section>
        </div>

        {/* Global toast viewport — one instance for the whole dashboard shell */}
        <ToastViewport />
      </div>
    </DashboardAuthGuard>
  );
}
