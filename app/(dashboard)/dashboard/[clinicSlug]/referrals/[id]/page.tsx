'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import StatusPill from '@/components/dashboard/StatusPill';
import { useClinicContext } from '@/lib/useClinicContext';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import { allowedTransitionsFor } from '@/lib/services/workflowStates';
import {
  clip,
  imagingTypeLabel,
  isClarificationNote,
  isReferralTerminal,
  referralDirection,
  referralPriorityLabel,
  referralStatusLabel,
  referralStatusTone,
} from '@/lib/services/referralWorkflow';

/**
 * REFERRAL DETAIL (B20) — the ONE screen where both tenants act on a referral.
 *
 * The role is not guessed from the activity type but from the DATA: the page
 * resolves its direction from `GET /api/imaging/requests/{id}` (the API already
 * proved the caller is a party to this row, otherwise it answers 403).
 *
 *   incoming (the activity side — imaging center / lab)
 *     * the workflow buttons are exactly `allowedTransitionsFor('imaging_requests')`
 *       of the CURRENT state — the same pure machine the server enforces, so the
 *       UI can never offer a transition the API would reject
 *     * upload the study (images / PDF) + the report, then deliver it
 *   outgoing (the referrer)
 *     * «طلب استكمال» — a dated note on the shared thread (a referrer never
 *       drives the partner's status; see the clarification route)
 *     * read the delivered result and download the produced files via
 *       short-lived signed URLs (the binaries are never public)
 *
 * Both legs are the SAME page because a referral is one row with two sides.
 */

type ReferralFile = {
  id: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  original_filename: string | null;
  created_at: string | null;
};

type ReferralRequest = {
  id: string;
  clinic_id: string;
  referring_clinic_id: string | null;
  patient_id: string | null;
  patient_id_center: string | null;
  patient_ref: string | null;
  requested_service: string | null;
  service_id: string | null;
  modality: string | null;
  status: string;
  imaging_status: string | null;
  priority: string | null;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type ReferralDetail = {
  direction: 'outgoing' | 'incoming';
  request: ReferralRequest;
  counterpart: { id: string; name: string | null; slug: string | null; activity_type: string | null } | null;
  patient: { id: string; full_name: string | null; phone: string | null } | null;
  service: { id: string; name: string | null; price: number | null } | null;
  files: ReferralFile[];
  result: { id: string; status: string; report_text: string | null; images: string[] | null; finalized_at: string | null } | null;
  timeline: Array<{ id: string; from_status: string | null; to_status: string; actor_role: string | null; reason: string | null; created_at: string | null }>;
};

const FILE_TYPE_AR: Record<string, string> = {
  image: 'صورة',
  video: 'فيديو',
  pdf: 'تقرير PDF',
  document: 'مستند',
  medical_report: 'تقرير طبي',
  medical_image: 'ملف تصوير (DICOM)',
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function formatDateAr(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const raw = body?.error ?? body?.detail;
  return typeof raw === 'string' && raw ? raw : fallback;
}

/**
 * First up-to-16 bytes of the file, hex-encoded — the SAME contract the signed
 * upload channel checks server-side (`magicBytesMatch`: up to 32 hex chars).
 * Sending it lets the server reject a spoofed MIME/extension (a renamed .exe
 * claiming image/png); an absent magic is never a blocker.
 */
async function readMagic(file: File): Promise<string | null> {
  try {
    const head = await file.slice(0, 16).arrayBuffer();
    return Array.from(new Uint8Array(head))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export default function ReferralDetailPage() {
  const params = useParams();
  const requestId = (params?.id as string) ?? '';
  const { clinicId, clinicSlug, role, authHeaders, loading, error: clinicError } = useClinicContext();

  const [detail, setDetail] = useState<ReferralDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Reverse leg (referrer → activity).
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyText, setClarifyText] = useState('');

  // Result leg (activity → referrer): the study + report.
  const [reportText, setReportText] = useState('');
  const [resultFiles, setResultFiles] = useState<File[]>([]);

  const isAdmin = role === 'owner' || role === 'manager';
  const backHref = `${tenantDashboardUrl(clinicSlug ?? '', 'referrals')}`;

  const load = useCallback(async () => {
    if (!clinicId || !requestId) return;
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/imaging/requests/${encodeURIComponent(requestId)}?clinic_id=${encodeURIComponent(clinicId)}`,
        { headers },
      );
      if (!res.ok) throw new Error(await readError(res, 'تعذر تحميل التحويل'));
      const body = await res.json();
      setDetail((body?.data ?? null) as ReferralDetail | null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
      setDetail(null);
    }
  }, [clinicId, requestId, authHeaders]);

  useEffect(() => {
    if (loading) return;
    void load();
  }, [loading, load]);

  const request = detail?.request ?? null;
  const direction = request ? referralDirection(clinicId, request) : detail?.direction ?? null;

  /**
   * The buttons come from the SHARED pure machine — never a local list — so a
   * state the server would refuse can never be rendered. `cancelled` is a real
   * transition of every non-terminal state; it is offered as a last resort.
   */
  const transitions = useMemo(
    () => (request ? allowedTransitionsFor('imaging_requests', request.status) : []),
    [request],
  );

  async function transition(toStatus: string) {
    if (!clinicId || !request) return;
    setBusy(toStatus);
    setErr(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/activity-requests/${encodeURIComponent(request.id)}?clinic_id=${encodeURIComponent(clinicId)}&table=imaging_requests`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ status: toStatus }),
        },
      );
      if (!res.ok) throw new Error(await readError(res, 'تعذر تحديث حالة التحويل'));
      setNotice(`تم تحديث الحالة إلى «${referralStatusLabel(toStatus)}»`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(null);
    }
  }

  /**
   * The REFERRER leg: «طلب استكمال». The referrer cannot drive the partner's
   * workflow (status is owned by the activity tenant), so this posts a dated
   * note on the shared thread — the route appends it and notifies the partner.
   */
  async function requestClarification() {
    if (!clinicId || !request) return;
    const note = clarifyText.trim();
    if (!note) {
      setErr('اكتب نص طلب الاستكمال');
      return;
    }
    setBusy('clarify');
    setErr(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/imaging/requests/${encodeURIComponent(request.id)}/clarification`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ clinic_id: clinicId, note }),
        },
      );
      if (!res.ok) throw new Error(await readError(res, 'تعذر إرسال طلب الاستكمال'));
      setClarifyText('');
      setClarifyOpen(false);
      setNotice('تم إرسال طلب الاستكمال إلى الطرف الآخر');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(null);
    }
  }

  /**
   * The PRODUCER leg: upload the study (images / CBCT / PDF) + the report, then
   * finalize the result. Binaries stream DIRECTLY to the private bucket through
   * the signed-upload flow (never buffered by the Next process — CBCT sizes),
   * `confirm` writes the authoritative metadata row after re-verifying the
   * object exists, and only then is the result finalized — which is what flips
   * the request to `completed` and notifies the referring clinic.
   *
   * The files are attached to `request.patient_id`: the medical-files gate
   * (resolveMedicalFileOrgAccess) accepts a partner only when the request links
   * this organization to THAT patient row.
   */
  async function uploadResult() {
    if (!clinicId || !request) return;
    if (!request.patient_id) {
      setErr('لا يوجد ملف مريض مرتبط بهذا التحويل — أنشئ ملف المريض أولًا ثم ارفع النتيجة');
      return;
    }
    if (!reportText.trim() && resultFiles.length === 0) {
      setErr('أضف تقريرًا أو ملفًا واحدًا على الأقل');
      return;
    }
    setBusy('result');
    setErr(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const imageIds: string[] = [];

      for (const file of resultFiles) {
        const magic = await readMagic(file);

        // 1) signed channel — the server enforces MIME / extension / size /
        //    magic signature BEFORE any URL is issued.
        const startRes = await fetch('/api/clinic/medical-files/upload-start', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            clinic_id: clinicId,
            patient_id: request.patient_id,
            imaging_request_id: request.id,
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            magic,
          }),
        });
        if (!startRes.ok) throw new Error(await readError(startRes, `تعذر تجهيز رفع ${file.name}`));
        const start = ((await startRes.json())?.data ?? {}) as Record<string, string | number>;

        // 2) the binary goes straight to storage (no server buffering).
        const put = await fetch(String(start.upload_url), {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        });
        if (!put.ok) throw new Error(`تعذر رفع ${file.name} إلى المخزن`);

        // 3) authoritative metadata row.
        const confirmRes = await fetch('/api/clinic/medical-files/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            clinic_id: clinicId,
            patient_id: request.patient_id,
            imaging_request_id: request.id,
            storage_path: start.storage_path,
            mime_type: file.type,
            size_bytes: file.size,
            filename: file.name,
            file_type: start.file_type,
            magic,
          }),
        });
        if (!confirmRes.ok) throw new Error(await readError(confirmRes, `تعذر توثيق ${file.name}`));
        const confirmed = (await confirmRes.json())?.data;
        if (confirmed?.id) imageIds.push(confirmed.id as string);
      }

      const res = await fetch(
        `/api/imaging/requests/${encodeURIComponent(request.id)}/result?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ report_text: reportText.trim() || null, image_ids: imageIds }),
        },
      );
      if (!res.ok) throw new Error(await readError(res, 'تعذر توثيق النتيجة'));
      setReportText('');
      setResultFiles([]);
      setNotice('تم رفع النتيجة وإبلاغ العيادة المُحيلة');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(null);
    }
  }

  /** Short-lived signed URL — the binaries are never public. */
  async function downloadFile(fileId: string) {
    if (!clinicId) return;
    setBusy(fileId);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/medical-files/${encodeURIComponent(fileId)}?clinic_id=${encodeURIComponent(clinicId)}`,
        { headers },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.data?.signed_url) throw new Error(body?.error ?? 'تعذر توليد رابط التنزيل');
      window.open(body.data.signed_url as string, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Skeleton className="h-60" />;
  if (clinicError) return <EmptyState title="تعذر تحميل التحويل" description={clinicError} />;
  if (!detail && !err) return <Skeleton className="h-60" />;

  const incoming = direction === 'incoming';
  const primary = transitions.filter((t) => t !== 'cancelled');
  const canCancel = transitions.includes('cancelled');
  const canUpload = isAdmin && !!request?.patient_id;

  return (
    <DashboardSection
      title={request ? `تحويل: ${request.patient_ref ?? 'مريض مُحال'}` : 'تفاصيل التحويل'}
      subtitle={
        request
          ? `${incoming ? 'وارد من' : 'مُرسل إلى'}: ${detail?.counterpart?.name ?? 'الطرف الآخر'} · ${imagingTypeLabel(request.modality, request.requested_service)}`
          : undefined
      }
    >
      <Link
        href={backHref}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
      >
        ← رجوع إلى التحويلات
      </Link>

      {err && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      {notice && (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {!request ? (
        <EmptyState title="التحويل غير متاح" description="قد يكون محذوفًا أو لا تملك صلاحية الاطلاع عليه." />
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base font-semibold text-white">{request.patient_ref ?? '—'}</p>
                <p className="text-sm text-slate-400">
                  {detail?.patient?.phone ? `هاتف: ${detail.patient.phone} · ` : ''}
                  {incoming ? 'من' : 'إلى'}: {detail?.counterpart?.name ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  أُنشئ في {formatDateAr(request.created_at)}
                  {request.scheduled_at ? ` · مجدول: ${formatDateAr(request.scheduled_at)}` : ''}
                  {request.completed_at ? ` · أُكمل: ${formatDateAr(request.completed_at)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {request.priority === 'urgent' && <StatusPill tone="danger">{referralPriorityLabel(request.priority)}</StatusPill>}
                <StatusPill tone={referralStatusTone(request.status)}>{referralStatusLabel(request.status)}</StatusPill>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">نوع التصوير</dt>
                <dd className="text-slate-200">{imagingTypeLabel(request.modality, request.requested_service)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الخدمة</dt>
                <dd className="text-slate-200">{detail?.service?.name ?? request.requested_service ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">حالة التنفيذ</dt>
                <dd className="text-slate-200">{request.imaging_status ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Actions — the buttons come from the SHARED machine, so the UI can
              never offer a transition the server would refuse. The referring
              clinic owns NO transition here (activity ownership: only an
              imaging center may drive imaging_requests); its leg is
              «طلب استكمال» — a dated note on the same row. */}
          {isAdmin && !isReferralTerminal(request.status) ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">
                {incoming ? 'إجراءات المركز' : 'إجراءات العيادة المُحيلة'}
              </h3>
              {incoming ? (
                <div className="flex flex-wrap gap-2">
                  {primary.map((to) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => void transition(to)}
                      disabled={busy !== null}
                      className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      {busy === to ? '…' : referralStatusLabel(to)}
                    </button>
                  ))}
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => void transition('cancelled')}
                      disabled={busy !== null}
                      className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      {busy === 'cancelled' ? '…' : 'إلغاء التحويل'}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">
                    لا تُدار حالة التحويل من العيادة المُحيلة — اطلب استكمالًا أو توضيحًا وسيصل إشعار للطرف الآخر.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setClarifyOpen((open) => !open);
                      setErr(null);
                    }}
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
                  >
                    {clarifyOpen ? 'إغلاق' : 'طلب استكمال'}
                  </button>
                  {clarifyOpen ? (
                    <div className="space-y-2">
                      <textarea
                        value={clarifyText}
                        onChange={(e) => setClarifyText(e.target.value)}
                        rows={3}
                        maxLength={800}
                        placeholder="اكتب ما تحتاجه: صورة إضافية، توضيح تشخيصي، تعديل موعد…"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 outline-none focus:border-amber-500/60"
                      />
                      <button
                        type="button"
                        onClick={() => void requestClarification()}
                        disabled={busy !== null}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                      >
                        {busy === 'clarify' ? 'جارٍ الإرسال…' : 'إرسال طلب الاستكمال'}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {/* Notes thread — clarifications are first-class lines. */}
          {request.notes ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">ملاحظات التحويل</h3>
              <div className="space-y-2">
                {request.notes.split('\n').filter((l) => l.trim()).map((line, idx) => (
                  <p
                    key={`${idx}-${line.slice(0, 12)}`}
                    className={
                      isClarificationNote(line)
                        ? 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-200'
                        : 'text-sm text-slate-300'
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {/* Producer leg — upload the study (images / CBCT / PDF) + the report.
              Binaries go straight to the private bucket via signed URLs; only
              then is the result finalized, which flips the request to
              `completed` and notifies the referring clinic. */}
          {incoming && canUpload && !isReferralTerminal(request.status) ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="mb-1 text-sm font-semibold text-white">رفع النتيجة وإرسالها للعيادة</h3>
              <p className="mb-3 text-xs text-slate-500">
                الملفات تُرفع إلى مخزن خاص وتُربط بهذا التحويل؛ العيادة المُحيلة تصلها الملفات بروابط موقعة قصيرة الأمد وتُبلَّغ تلقائيًا.
              </p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                maxLength={20000}
                placeholder="نص التقرير (اختياري إن أرفقت ملف تقرير)…"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
              />
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => setResultFiles(Array.from(e.target.files ?? []))}
                className="mb-3 block w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-900/80 p-2 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-cyan-200"
              />
              {resultFiles.length > 0 ? (
                <ul className="mb-3 space-y-1 text-xs text-slate-400">
                  {resultFiles.map((f) => (
                    <li key={f.name}>{f.name} · {formatBytes(f.size)}</li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                onClick={() => void uploadResult()}
                disabled={busy !== null}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {busy === 'result' ? 'جارٍ الرفع…' : 'توثيق النتيجة وإبلاغ العيادة'}
              </button>
            </div>
          ) : null}

          {/* Files + report — readable by BOTH sides of the referral. */}
          {detail?.result?.report_text || (detail?.files?.length ?? 0) > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">النتيجة والمرفقات</h3>
              {detail?.result?.report_text ? (
                <p className="mb-3 whitespace-pre-line rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
                  {detail.result.report_text}
                </p>
              ) : null}
              {detail?.files?.length ? (
                <ul className="space-y-2">
                  {detail.files.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{f.original_filename ?? 'ملف بلا اسم'}</p>
                        <p className="text-xs text-slate-500">
                          {FILE_TYPE_AR[f.file_type] ?? f.file_type} · {formatBytes(f.size_bytes)} · {formatDateAr(f.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void downloadFile(f.id)}
                        disabled={busy !== null}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200 disabled:opacity-50"
                      >
                        {busy === f.id ? '…' : 'تنزيل'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Timeline — the immutable workflow trail of the row. */}
          {detail?.timeline?.length ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="mb-3 text-sm font-semibold text-white">مسار التحويل</h3>
              <ol className="space-y-3">
                {detail.timeline.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-500">{formatDateAr(t.created_at)}</span>
                    <span className="text-slate-300">
                      {referralStatusLabel(t.from_status)} → <span className="text-white">{referralStatusLabel(t.to_status)}</span>
                    </span>
                    {t.actor_role ? <StatusPill tone="neutral">{t.actor_role}</StatusPill> : null}
                    {t.reason ? <span className="text-xs text-slate-500">{clip(t.reason, 120)}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </DashboardSection>
  );
}

