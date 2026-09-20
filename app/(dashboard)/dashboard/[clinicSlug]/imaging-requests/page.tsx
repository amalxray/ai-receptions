'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import { useClinicContext } from '@/lib/useClinicContext';

/** IMAGING REQUESTS — imaging-center inbox (referral workflow UI). */
type Row = {
  id: string;
  clinic_id: string;
  referring_clinic_id: string | null;
  patient_id: string | null;
  patient_id_center: string | null;
  patient_ref: string | null;
  requested_service: string | null;
  status: string;
  notes: string | null;
  created_at: string | null;
};

const STATUS_AR: Record<string, string> = {
  submitted: 'مُرسل — بانتظار القبول',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  needs_clarification: 'يحتاج توضيحًا',
  scheduled: 'مجدول',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  requested: 'مطلوب',
  ready: 'جاهز للتسليم',
  delivered: 'مُسلّم',
};

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  submitted: 'warning',
  accepted: 'success',
  rejected: 'danger',
  needs_clarification: 'warning',
  scheduled: 'neutral',
  in_progress: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

const NEXT: Record<string, string[]> = {
  submitted: ['accepted', 'rejected', 'needs_clarification', 'cancelled'],
  accepted: ['scheduled', 'cancelled'],
  needs_clarification: ['submitted', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'completed', 'cancelled'],
  ready: ['delivered', 'completed', 'cancelled'],
};

/** WORKFLOW_TRANSITION_INVALID reasons → Arabic, so staff see real causes. */
const WORKFLOW_REASON_AR: Record<string, string> = {
  transition_conflict: 'تعارض في الحالة — عُدّل الطلب من جهاز آخر، أعد تحميل الصفحة',
  entity_not_found: 'الطلب غير موجود',
  unknown_entity: 'نوع طلب غير معروف',
  unknown_state: 'حالة غير معروفة',
  wrong_activity: 'هذا الطلب لا يتبع نشاط مركز التصوير',
  clinic_unresolvable: 'تعذر التحقق من نشاط العيادة',
  infra_error: 'خطأ مؤقت في قاعدة البيانات — أعد المحاولة',
};

function describeApiError(body: Record<string, unknown> | undefined, fallback: string): string {
  const b = (body ?? {}) as { error?: string; reason?: string; from_status?: string; to_status?: string; detail?: string };
  if (b.error === 'WORKFLOW_TRANSITION_INVALID') {
    const base = WORKFLOW_REASON_AR[b.reason ?? ''] ?? 'انتقال حالة غير مسموح';
    return b.from_status ? `${base} (${b.from_status} → ${b.to_status})` : base;
  }
  const msg = b.error ?? fallback;
  // 500s now carry the real underlying message in `detail` — surface it.
  return b.detail ? `${msg} — ${b.detail}` : msg;
}

export default function ImagingRequestsPage() {
  const { clinicId, authHeaders, loading, error: clinicError } = useClinicContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/clinic/activity-requests?clinic_id=${encodeURIComponent(clinicId)}&table=imaging_requests`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(describeApiError(body, 'تعذر تحميل طلبات التصوير'));
      setRows([]);
      return;
    }
    const body = await res.json();
    setRows((body?.data ?? []) as Row[]);
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (loading || !clinicId) return;
    void load();
  }, [loading, clinicId, load]);

  async function transition(requestId: string, toStatus: string) {
    if (!clinicId) return;
    setBusyId(requestId);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/activity-requests/${requestId}?clinic_id=${encodeURIComponent(clinicId)}&table=imaging_requests`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ status: toStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(describeApiError(body, 'تعذر تحديث الحالة'));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل الطلبات" description={clinicError} />;

  return (
    <DashboardSection title="طلبات التصوير" subtitle="الطلبات الواردة من العيادات المحيلة — راجع، اقبل، رفض، أو حدد موعدًا.">
      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}
      {rows === null ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد طلبات تصوير" description="ستظهر هنا الطلبات الواردة من العيادات المحيلة المرتبطة بمركزك." />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              busy={busyId === r.id}
              onTransition={transition}
              clinicId={clinicId}
              authHeaders={authHeaders}
              onLinked={load}
            />
          ))}
        </div>
      )}
    </DashboardSection>
  );
function RequestCard({
  r,
  busy,
  onTransition,
  clinicId,
  authHeaders,
  onLinked,
}: {
  r: Row;
  busy: boolean;
  onTransition: (id: string, to: string) => void;
  clinicId: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  onLinked: () => Promise<void> | void;
}) {
  const nexts = NEXT[r.status] ?? [];
  const refName = r.referring_clinic_id ? r.referring_clinic_id.slice(0, 8) + '…' : null;
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // ONE-CLICK PATIENT FILE (Phase 7.4): creates the center-side patient file
  // from the referral (phone → match existing, else create) then links it.
  async function createPatientFile() {
    if (!clinicId) return;
    setCreating(true);
    setCreateErr(null);
    setCreateMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/imaging/requests/${encodeURIComponent(r.id)}/create-patient`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ clinic_id: clinicId, phone: phone.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'تعذر إنشاء ملف المريض');
      setCreateMsg('تم إنشاء/ربط ملف المريض ✅');
      await onLinked();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{r.requested_service ?? 'طلب تصوير'}</p>
          <p className="mt-1 text-sm text-slate-400">
            المريض: {r.patient_ref ?? (r.patient_id ? r.patient_id.slice(0, 8) + '…' : '—')}
            {refName ? ` · العيادة المحيلة: ${refName}` : ''}
          </p>
        </div>
        <StatusPill tone={TONE[r.status] ?? 'neutral'}>{STATUS_AR[r.status] ?? r.status}</StatusPill>
      </div>
      {r.notes && <p className="mt-2 text-sm text-slate-300">{r.notes}</p>}
      {/* patient_id = the REFERRING clinic's patient; patient_id_center = OUR file */}
      {!r.patient_id_center && clinicId && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={createPatientFile}
              disabled={creating || busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {creating ? 'جارٍ الإنشاء…' : '➕ إنشاء ملف المريض'}
            </button>
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="هاتف المريض (للربط بملف موجود)"
              className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
            />
          </div>
          {createMsg && <p className="mt-2 text-xs text-emerald-400">{createMsg}</p>}
          {createErr && <p className="mt-2 text-xs text-red-400">{createErr}</p>}
        </div>
      )}
      {r.patient_id_center && (
        <p className="mt-2 text-xs text-emerald-400">ملف مركز التصوير: مرتبط ✓</p>
      )}
      <p className="mt-2 text-xs text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString('ar') : ''}</p>
      {nexts.length > 0 && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {nexts.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onTransition(r.id, s)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/70 hover:text-white"
            >
              {s === 'accepted' ? 'قبول' : s === 'rejected' ? 'رفض' : s === 'cancelled' ? 'إلغاء' : STATUS_AR[s] ?? s}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="mt-3 text-xs text-cyan-300">جارٍ التحديث…</p>}
    </div>
  );
}
}