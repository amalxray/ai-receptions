'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';

/**
 * ACHIEVEMENT BADGES — owner management (Phase 5).
 * Certifications / awards / memberships / achievements with optional issuer,
 * year, icon and a verification link (https-only, enforced by the API too).
 * Visible badges surface in the public page's "شارات الإنجازات" section.
 */

type Badge = {
  id: string;
  type: 'certification' | 'award' | 'membership' | 'achievement';
  title: string;
  issuer: string | null;
  year: number | null;
  icon_url: string | null;
  verify_url: string | null;
  display_order: number;
  enabled: boolean;
};

const TYPES: { value: Badge['type']; label: string; icon: string }[] = [
  { value: 'certification', label: 'شهادة اعتماد', icon: '📜' },
  { value: 'award', label: 'جائزة', icon: '🏆' },
  { value: 'membership', label: 'عضوية', icon: '🤝' },
  { value: 'achievement', label: 'إنجاز', icon: '🎖️' },
];

const typeMeta = (t: Badge['type']) => TYPES.find((x) => x.value === t) ?? TYPES[0];

export default function BadgesPage() {
  const { clinicId, authHeaders, loading, error: clinicError } = useClinicContext();
  const [rows, setRows] = useState<Badge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    type: 'certification' as Badge['type'],
    title: '',
    issuer: '',
    year: '',
    icon_url: '',
    verify_url: '',
  });

  const load = useCallback(async () => {
    if (!clinicId) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/clinic/badges?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body?.error ?? 'تعذر تحميل الشارات');
      setRows([]);
      return;
    }
    const body = await res.json();
    setRows((body?.data ?? []) as Badge[]);
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (loading || !clinicId) return;
    void load();
  }, [loading, clinicId, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || busy || !form.title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/badges?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          title: form.title.trim(),
          issuer: form.issuer.trim() || null,
          year: form.year ? Number(form.year) : null,
          icon_url: form.icon_url.trim() || null,
          verify_url: form.verify_url.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر حفظ الشارة');
      setForm({ type: form.type, title: '', issuer: '', year: '', icon_url: '', verify_url: '' });
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    if (!clinicId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/clinic/badges/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!clinicId || !window.confirm('حذف هذه الشارة نهائياً؟')) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/clinic/badges/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
        headers,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر التحميل" description={clinicError} />;

  return (
    <DashboardSection
      title="شارات الإنجازات"
      subtitle="الشهادات والجوائز والعضويات التي تبني الثقة. تظهر في صفحتك العامة مع إمكانية رابط تحقق رسمي."
    >
      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      {/* Add form */}
      <form onSubmit={create} className="mb-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">النوع *</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Badge['type'] }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">العنوان *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="مثال: البورد الأمريكي لطب الأسنان"
              maxLength={200}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">الجهة المانحة</span>
            <input
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
              maxLength={200}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">السنة</span>
            <input
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="2025"
              dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">رابط أيقونة (اختياري)</span>
            <input
              value={form.icon_url}
              onChange={(e) => setForm((f) => ({ ...f, icon_url: e.target.value }))}
              placeholder="https://…"
              dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">رابط تحقق رسمي (اختياري)</span>
            <input
              value={form.verify_url}
              onChange={(e) => setForm((f) => ({ ...f, verify_url: e.target.value }))}
              placeholder="https://…"
              dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !form.title.trim()}
          className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : '➕ إضافة الشارة'}
        </button>
      </form>
    </DashboardSection>
  );
}