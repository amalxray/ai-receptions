'use client';

import { useEffect, useState } from 'react';

type SubscriptionRow = {
  id: string;
  clinic_id: string;
  clinic_name?: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  created_at: string | null;
};

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [extendId, setExtendId] = useState('');
  const [extendMonths, setExtendMonths] = useState('1');

  useEffect(() => {
    fetch('/api/admin/subscriptions')
      .then((r) => r.json())
      .then((b) => {
        if (!b.data) throw new Error(b.error ?? 'فشل التحميل');
        setRows(b.data.subscriptions as SubscriptionRow[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'فشل التحميل'))
      .finally(() => setLoading(false));
  }, []);

  async function extend() {
    setError(null);
    setResult(null);
    if (!extendId) {
      setError('اختر الاشتراك أولاً');
      return;
    }
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: extendId, months: Number(extendMonths) }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'فشل التمديد');
      setResult(`تم تمديد الاشتراك حتى ${b.data?.current_period_end?.slice(0, 10) ?? ''}`);
      setExtendId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التمديد');
    }
  }

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">💳 الاشتراكات</h2>
      <p className="mt-1 text-sm text-slate-400">إدارة اشتراكات المؤسسات وتمديدات يدوية.</p>
      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {result && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{result}</div>}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-800">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold text-slate-200">{s.clinic_name ?? s.clinic_id.slice(0, 8)}</p>
                <p className="text-xs text-slate-500">
                  {s.plan_id} · {s.status} · حتى {s.current_period_end?.slice(0, 10) ?? '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExtendId(s.id)}
                  className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                >
                  تمديد
                </button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-3 text-sm text-slate-500">لا توجد اشتراكات.</li>}
        </ul>
      )}

      {extendId && (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="mb-3 text-sm font-semibold text-white">تمديد اشتراك</p>
          <div className="flex flex-wrap items-center gap-3">
            <input type="number" min="1" max="36" value={extendMonths} onChange={(e) => setExtendMonths(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" />
            <span className="text-xs text-slate-400">شهراً</span>
            <button type="button" onClick={() => void extend()} className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
              تأكيد التمديد
            </button>
            <button type="button" onClick={() => setExtendId('')} className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}