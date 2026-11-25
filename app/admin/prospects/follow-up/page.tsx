import { redirect } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getPendingFollowUps } from '@/lib/services/prospecting/followUp';
import ProspectFollowUpList from './ProspectFollowUpList';

export default async function ProspectFollowUpPage() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) redirect('/login?next=/admin/prospects/follow-up');

  const pending = await getPendingFollowUps();
  const total = pending.stage_1.length + pending.stage_2.length;

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">متابعة العيادات المحتملة</h1>
          <p className="mt-2 text-sm text-slate-400">
            المرحلة الأولى بعد 3 أيام من أول رسالة، والمرحلة الأخيرة بعد 7 أيام من المتابعة الأولى.
          </p>
        </div>
        <a href="/admin/prospects" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
          العودة إلى العيادات
        </a>
      </header>
      <p className="text-sm text-amber-200">🔔 {total} عيادة تحتاج متابعة</p>
      <ProspectFollowUpList pending={pending} />
    </main>
  );
}
