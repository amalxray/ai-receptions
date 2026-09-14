'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, CreditCard, Megaphone, Users } from 'lucide-react';
import StatTile from '@/components/admin/StatTile';
import { BarList, DonutChart, Panel, type Segment } from '@/components/admin/AdminCharts';

type Tally = { label: string; count: number };

type RecentClinic = {
  id: string;
  name: string;
  slug: string;
  activity_type: string | null;
  created_at: string;
};

type AdminStats = {
  clinics: number;
  active_clinics: number;
  members: number;
  active_subscriptions: number;
  payments_volume: number;
  clinics_by_type: Tally[];
  members_by_role: Tally[];
  subscriptions_by_status: Tally[];
  recent_clinics: RecentClinic[];
};

const TYPE_LABELS: Record<string, string> = {
  clinic: 'عيادة',
  center: 'مركز',
  lab: 'مختبر',
  radiology: 'أشعة',
  other: 'أخرى',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك',
  admin: 'مدير',
  staff: 'موظف',
  receptionist: 'استقبال',
  doctor: 'طبيب',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  trialing: 'تجريبي',
  past_due: 'متأخر',
  canceled: 'ملغى',
  expired: 'منتهٍ',
};

const PALETTE = ['#06b6d4', '#34d399', '#f5a623', '#8b5cf6', '#f472b6', '#38bdf8'];

const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => res.json())
      .then((b) => {
        if (!b.data) throw new Error(b.error ?? 'فشل تحميل الإحصائيات');
        setStats(b.data as AdminStats);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const clinicSegments: Segment[] = useMemo(
    () =>
      (stats?.clinics_by_type ?? []).map((t, i) => ({
        label: TYPE_LABELS[t.label] ?? t.label,
        value: t.count,
        color: PALETTE[i % PALETTE.length],
      })),
    [stats]
  );

  const subscriptionSegments: Segment[] = useMemo(
    () =>
      (stats?.subscriptions_by_status ?? []).map((t, i) => ({
        label: STATUS_LABELS[t.label] ?? t.label,
        value: t.count,
        color: PALETTE[i % PALETTE.length],
      })),
    [stats]
  );

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-400">
        جارٍ تحميل الإحصائيات…
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-[2rem] border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        {error ?? 'تعذّر تحميل الإحصائيات.'}
      </div>
    );
  }

  return <Overview stats={stats} clinicSegments={clinicSegments} subscriptionSegments={subscriptionSegments} />;
}

/** OWNER OVERVIEW — stat tiles, charts and a recent-activity rail. */
function Overview({
  stats,
  clinicSegments,
  subscriptionSegments,
}: {
  stats: AdminStats;
  clinicSegments: Segment[];
  subscriptionSegments: Segment[];
}) {
  const quickActions = [
    { href: '/admin/clinics', label: 'إدارة المؤسسات', icon: Building2, hint: `${stats.clinics} مؤسسة` },
    { href: '/admin/users', label: 'إدارة المستخدمين', icon: Users, hint: `${stats.members} عضوية` },
    {
      href: '/admin/subscriptions',
      label: 'متابعة الاشتراكات',
      icon: CreditCard,
      hint: `${stats.active_subscriptions} نشط`,
    },
    { href: '/admin/notifications', label: 'إرسال إشعار', icon: Megaphone, hint: 'بثّ فوري' },
  ];

  const memberBars = (stats.members_by_role ?? []).map((r, i) => ({
    label: ROLE_LABELS[r.label] ?? r.label,
    value: r.count,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile title="المؤسسات" value={stats.clinics} icon="🏢" accent="cyan" trend={`${stats.active_clinics} نشطة`} />
        <StatTile title="العضويات" value={stats.members} icon="👥" accent="emerald" />
        <StatTile
          title="الاشتراكات النشطة"
          value={stats.active_subscriptions}
          icon="💳"
          accent="violet"
        />
        <StatTile
          title="حجم المدفوعات"
          value={Math.round(stats.payments_volume)}
          suffix="₪"
          icon="💰"
          accent="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="توزيع المؤسسات" hint="حسب نوع النشاط" beam>
          <DonutChart
            segments={clinicSegments}
            centerLabel="مؤسسة"
            size={190}
            thickness={22}
          />
        </Panel>
        <Panel title="الاشتراكات" hint="حسب الحالة الحالية">
          <DonutChart
            segments={subscriptionSegments}
            centerLabel="اشتراك"
            size={190}
            thickness={22}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="العضويات حسب الدور" hint="توزيع صلاحيات الفريق">
          <BarList items={memberBars} />
        </Panel>
        <Panel title="إجراءات سريعة" hint="اختصارات إدارية">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-amber-400/50 hover:bg-slate-900"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-white">{action.label}</span>
                      <span className="block text-xs text-slate-400">{action.hint}</span>
                    </span>
                  </span>
                  <ArrowLeft className="h-4 w-4 text-slate-500 transition group-hover:text-amber-300" />
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Recent activity */}
      <Panel title="أحدث المؤسسات" hint="آخر ست مؤسسات انضمّت للمنصة">
        <div className="divide-y divide-slate-800">
          {stats.recent_clinics.length === 0 && (
            <p className="py-4 text-sm text-slate-500">لا توجد مؤسسات بعد.</p>
          )}
          {stats.recent_clinics.map((clinic) => (
            <div key={clinic.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-lg">
                  🏥
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{clinic.name}</p>
                  <p className="text-xs text-slate-400">
                    {TYPE_LABELS[clinic.activity_type ?? ''] ?? clinic.activity_type ?? 'غير محدد'}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {clinic.created_at ? dateFmt.format(new Date(clinic.created_at)) : ''}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}