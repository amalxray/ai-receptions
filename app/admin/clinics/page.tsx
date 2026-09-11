'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type ClinicRow = {
  id: string;
  name: string;
  slug: string;
  activity_type: string | null;
  created_at: string | null;
  deleted_at: string | null;
  members: number;
};

const ACTIVITY_NAMES: Record<string, string> = {
  clinic: 'عيادة أسنان',
  imaging_center: 'مركز تصوير',
  dental_lab: 'مختبر أسنان',
};

export default function AdminClinicsPage() {
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/clinics');
      const b = await res.json();
      if (!res.ok || !b.data) throw new Error(b.error ?? 'فشل تحميل المؤسسات');
      setClinics(b.data.clinics as ClinicRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(clinic: ClinicRow) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/clinics/${clinic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: !clinic.deleted_at }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'فشل التحديث');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث');
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">🏢 المؤسسات</h2>
      <p className="mt-1 text-sm text-slate-400">كل المؤسسات المسجلة · تفعيل/تعطيل سريع.</p>
      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {loading ? (
        <div className="mt-5 text-sm text-slate-400">جارٍ التحميل...</div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-800">
          {clinics.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <Link href={`/admin/clinics/${c.id}`} className="font-semibold text-white hover:text-amber-200">
                  {c.name}
                </Link>
                <p className="text-xs text-slate-500">
                  /{c.slug} · {ACTIVITY_NAMES[c.activity_type ?? ''] ?? '—'} · {c.members} أعضاء
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggle(c)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  c.deleted_at ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30' : 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                }`}
              >
                {c.deleted_at ? 'تفعيل' : 'تعطيل'}
              </button>
            </li>
          ))}
          {clinics.length === 0 && <li className="py-3 text-sm text-slate-500">لا توجد مؤسسات.</li>}
        </ul>
      )}
    </div>
  );
}