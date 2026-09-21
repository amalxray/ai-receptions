'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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

/** Error body contract shared with /api/clinic/badges (error + optional detail / 402 gate fields). */
type ApiErrorBody = { error?: string; detail?: string; required_plan?: string; plan_name_ar?: string };

/** Joins error+detail so a server failure is never an opaque "Internal error" (#34). */
function apiErrorMessage(body: ApiErrorBody | null | undefined, fallback: string): string {
  const parts = [body?.error, body?.detail].filter((v): v is string => Boolean(v));
  return parts.join(' — ') || fallback;
}

/** The plan gate rejected the call → the page must render the upgrade panel, not the form (#34). */
function isGateLocked(res: Response, body: ApiErrorBody | null | undefined): boolean {
  return res.status === 402 || body?.error === 'FEATURE_LOCKED';
}

export default function BadgesPage() {
  const { clinicId, authHeaders, loading, error: clinicError } = useClinicContext();
  const [rows, setRows] = useState<Badge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 402 FEATURE_LOCKED — the clinic's plan does not include badges; upgrade panel replaces the form. */
  const [locked, setLocked] = useState<{ requiredPlan: string; planNameAr: string } | null>(null);

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
      const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
      if (isGateLocked(res, body)) {
        setLocked({ requiredPlan: body?.required_plan ?? '', planNameAr: body?.plan_name_ar ?? '' });
        setErr(null);
      } else {
        setErr(apiErrorMessage(body, 'تعذر تحميل الشارات'));
      }
      setRows([]);
      return;
    }
    const body = await res.json();
    setLocked(null);
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
      const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
      if (isGateLocked(res, body)) {
        setLocked({ requiredPlan: body?.required_plan ?? '', planNameAr: body?.plan_name_ar ?? '' });
        return;
      }
      if (!res.ok) throw new Error(apiErrorMessage(body, 'تعذر حفظ الشارة'));
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

  // Plan gate (#34): badges are tier-restricted — show the upgrade path instead
  // of a form that can only ever fail with a confusing error.
  if (locked) {
    return (
      <DashboardSection
        title="شارات الإنجازات"
        subtitle="الشهادات والجوائز والعضويات التي تبني الثقة. تظهر في صفحتك العامة مع إمكانية رابط تحقق رسمي."
      >
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
          <p className="text-3xl">🔒</p>
          <h2 className="mt-2 text-lg font-bold text-amber-200">
            ميزة «شارات الإنجازات» غير مضمّنة في خطتك الحالية
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {locked.planNameAr
              ? `الميزة متاحة في خطة «${locked.planNameAr}». ترقِ الخطت لتفعيل الشارات على صفحتك العامة.`
              : 'ترقِ الخطت لتفعيل الشارات على صفحتك العامة.'}
          </p>
          <Link href="/dashboard/upgrade/badges" className="btn-primary mt-5 inline-block">
            ⭐ عرض خيارات الترقية
          </Link>
        </div>
      </DashboardSection>
    );
  }

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