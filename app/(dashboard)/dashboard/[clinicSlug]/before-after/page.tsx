'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';
import BeforeAfterSlider from '@/components/public/BeforeAfterSlider';

/**
 * BEFORE/AFTER GALLERY — owner management (Phase 4).
 * Uploads two real files (قبل/بعد) via the tenant-scoped multipart API;
 * patient consent is HARD-required (save stays disabled without it).
 * Live preview reuses the public BeforeAfterSlider — what the owner sees is
 * exactly what visitors get.
 */

type BeforeAfterCase = {
  id: string;
  title: string;
  description: string | null;
  before_url: string;
  after_url: string;
  patient_consent: boolean;
  display_order: number;
  enabled: boolean;
};

export default function BeforeAfterPage() {
  const { clinicId, authHeaders, loading, error: clinicError } = useClinicContext();
  const [rows, setRows] = useState<BeforeAfterCase[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{ before: string; after: string } | null>(null);
  const beforeRef = useRef<HTMLInputElement | null>(null);
  const afterRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/clinic/before-after?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body?.error ?? 'تعذر تحميل حالات قبل/بعد');
      setRows([]);
      return;
    }
    const body = await res.json();
    setRows((body?.data ?? []) as BeforeAfterCase[]);
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (loading || !clinicId) return;
    void load();
  }, [loading, clinicId, load]);

  // Object URLs for the live preview (revoked on change/unmount).
  useEffect(() => {
    if (!beforeFile || !afterFile) {
      setPreviews(null);
      return;
    }
    const b = URL.createObjectURL(beforeFile);
    const a = URL.createObjectURL(afterFile);
    setPreviews({ before: b, after: a });
    return () => {
      URL.revokeObjectURL(b);
      URL.revokeObjectURL(a);
    };
  }, [beforeFile, afterFile]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || !beforeFile || !afterFile || !consent || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('patient_consent', 'true');
      form.append('before', beforeFile);
      form.append('after', afterFile);
      const res = await fetch(`/api/clinic/before-after?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers,
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر حفظ الحالة');
      setTitle(''); setDescription(''); setConsent(false);
      setBeforeFile(null); setAfterFile(null);
      if (beforeRef.current) beforeRef.current.value = '';
      if (afterRef.current) afterRef.current.value = '';
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(caseId: string, enabled: boolean) {
    if (!clinicId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/clinic/before-after/${caseId}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function move(row: BeforeAfterCase, dir: -1 | 1) {
    if (!clinicId) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/clinic/before-after/${row.id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: Math.max(0, row.display_order + dir) }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(caseId: string) {
    if (!clinicId || !window.confirm('حذف هذه الحالة نهائياً؟')) return;
    setBusy(true);
    try {
      const headers = await authHeaders();
      await fetch(`/api/clinic/before-after/${caseId}?clinic_id=${encodeURIComponent(clinicId)}`, {
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
      title="معرض قبل / بعد"
      subtitle="اعرض نتائج عملك بمقارنة تفاعلية. صور JPG/PNG/WebP حتى 10MB لكل صورة — وموافقة المريض إلزامية قبل النشر."
    >
      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      {/* Add form */}
      <form onSubmit={create} className="mb-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">صورة «قبل» *</span>
            <input
              ref={beforeRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-cyan-500/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-cyan-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">صورة «بعد» *</span>
            <input
              ref={afterRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-500/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-emerald-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">العنوان *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تبييض — جلسة واحدة"
              maxLength={200}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">وصف قصير</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {previews && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-400">معاينة حية (كما ستظهر للزوار):</p>
            <div className="max-w-md">
              <BeforeAfterSlider before={previews.before} after={previews.after} title={title || 'معاينة'} />
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-emerald-500" />
          <span>
            أُقرّ بأن المريض وافق خطياً على نشر هذه الصور.
            <span className="mt-1 block text-xs text-slate-500">لا يمكن الحفظ بدون الموافقة — والخدمة ترفضها حتى لو تجاوزت الواجهة.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || !consent || !title.trim() || !beforeFile || !afterFile}
          className="rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : '➕ إضافة الحالة'}
        </button>
      </form>
        {/* Cases list */}
        {rows === null ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <EmptyState title="لا توجد حالات بعد" description="أضف أول حالة قبل/بعد من النموذج أعلاه — ستظهر مباشرة في صفحتك العامة بعد الحفظ." />
        ) : (
          <div className="space-y-6">
            {rows.map((row, idx) => (
              <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="max-w-md">
                    <BeforeAfterSlider before={row.before_url} after={row.after_url} title={row.title} />
                  </div>
                  <div>
                    <p className="font-bold text-white">{row.title}</p>
                    {row.description && <p className="mt-1 text-sm text-slate-400">{row.description}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      {row.patient_consent ? '✅ موافقة المريض موثقة' : '⚠️ بدون موافقة موثقة'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void move(row, -1)}
                        disabled={busy || idx === 0}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
                      >
                        ↑ أعلى
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(row, 1)}
                        disabled={busy || idx === (rows?.length ?? 0) - 1}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
                      >
                        ↓ أسفل
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggle(row.id, !row.enabled)}
                        disabled={busy}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                          row.enabled
                            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                            : 'bg-slate-700/40 text-slate-400 hover:bg-slate-700/60'
                        }`}
                      >
                        {row.enabled ? '👁️ ظاهرة' : '🚫 مخفية'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(row.id)}
                        disabled={busy}
                        className="rounded-full bg-rose-500/15 px-4 py-1.5 text-xs text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"
                      >
                        🗑️ حذف
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardSection>
  );
}

