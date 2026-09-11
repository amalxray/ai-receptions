'use client';

import { useEffect, useState } from 'react';

type AdminStats = {
  clinics: number;
  active_clinics: number;
  members: number;
  active_subscriptions: number;
  payments_volume: number;
};

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

  const cards = stats
    ? [
        { icon: '🏢', label: 'المؤسسات', value: stats.clinics },
        { icon: '✅', label: 'مؤسسات نشطة', value: stats.active_clinics },
        { icon: '👥', label: 'الأعضاء', value: stats.members },
        { icon: '💳', label: 'اشتراكات نشطة', value: stats.active_subscriptions },
        { icon: '💰', label: 'حجم الدفعات', value: `${stats.payments_volume.toFixed(0)} ₪` },
      ]
    : [];

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">📊 نظرة عامة على المنصة</h2>
      <p className="mt-1 text-sm text-slate-400">إحصائيات مباشرة من قاعدة البيانات.</p>

      {loading ? (
        <div className="mt-6 text-sm text-slate-400">جارٍ تحميل الإحصائيات...</div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-2xl">{card.icon}</p>
              <p className="mt-2 text-2xl font-bold text-amber-200">{card.value}</p>
              <p className="text-xs text-slate-400">{card.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}