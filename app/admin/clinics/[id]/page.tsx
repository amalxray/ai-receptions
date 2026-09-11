'use client';

import { useEffect, useState } from 'react';

export default function AdminClinicDetailPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<{
    clinic: { name: string; slug: string; activity_type: string | null; created_at: string | null };
    members: Array<{ id: string; role: string; user_id: string }>;
    subscription: { id: string; plan_id: string; status: string; current_period_end: string | null } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/clinics/${params.id}`)
      .then((r) => r.json())
      .then((b) => {
        if (!b.data) throw new Error(b.error ?? 'غير موجود');
        setDetail(b.data);
      })
      .catch((e) => setError(e.message));
  }, [params.id]);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">🏢 تفاصيل المؤسسة</h2>
      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
      ) : !detail ? (
        <p className="mt-4 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-base font-bold text-white">{detail.clinic.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              /{detail.clinic.slug} · {detail.clinic.activity_type ?? '—'} · أُنشئت {detail.clinic.created_at ?? '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-slate-200">💳 الاشتراك</p>
            {detail.subscription ? (
              <p className="mt-1 text-xs text-slate-400">
                الخطة {detail.subscription.plan_id} · {detail.subscription.status} · حتى {detail.subscription.current_period_end?.slice(0, 10) ?? '—'}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">لا يوجد اشتراك.</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-slate-200">👥 الأعضاء ({detail.members.length})</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {detail.members.map((m) => (
                <li key={m.id}>
                  {m.role} · {m.user_id.slice(0, 8)}…
                </li>
              ))}
              {detail.members.length === 0 && <li>لا يوجد أعضاء.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}