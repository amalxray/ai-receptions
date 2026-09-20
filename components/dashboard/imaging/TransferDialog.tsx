'use client';

/**
 * PATIENT → IMAGING CENTER TRANSFER DIALOG (Phase 7.1 / 7.2).
 *
 * Lets a clinic's staff refer a patient to a partner imaging center:
 *   1. center picker — partner orgs with activity=imaging_center
 *      (GET /api/clinic/partner-orgs, includes relationship status),
 *   2. imaging type — services from the TARGET center's clinic_services
 *      (GET /api/clinic/services?clinic_id=<center>), because
 *      /api/imaging/referrals requires service_id to belong to the target,
 *   3. optional notes.
 *
 * Submission POSTs /api/imaging/referrals with the exact contract that route
 * validates (clinic_id, target_imaging_center_id, patient_id, service_id…).
 */

import { useEffect, useMemo, useState } from 'react';

type PartnerOrg = {
  id: string;
  name: string;
  relationship_status?: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
};

export type TransferDialogTarget = {
  patientId: string;
  patientName: string;
};

type Props = {
  clinicId: string;
  authHeaders: () => Promise<Record<string, string>>;
  target: TransferDialogTarget;
  onClose: () => void;
  onDone?: (result: { ok: boolean; message: string }) => void;
};

export default function TransferDialog({ clinicId, authHeaders, target, onClose, onDone }: Props) {
  const [centers, setCenters] = useState<PartnerOrg[] | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [centerId, setCenterId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedCenters = useMemo(
    () => (centers ?? []).filter((c) => c.relationship_status === 'accepted'),
    [centers],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/clinic/partner-orgs?clinic_id=${encodeURIComponent(clinicId)}&activity=imaging_center`,
          { headers },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'تعذر تحميل مراكز التصوير');
        if (!cancelled) setCenters(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل مراكز التصوير');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, authHeaders]);

  // Load the TARGET center's service catalog through the partner-scoped
  // endpoint: /api/clinic/services requires membership of the TARGET center
  // (403 for a referring clinic → empty dropdown), while this endpoint
  // authorizes OUR clinic + the accepted relationship and returns the
  // center's active services — the exact set /api/imaging/referrals accepts.
  useEffect(() => {
    setServiceId('');
    setServices([]);
    if (!centerId) return;
    let cancelled = false;
    setServicesLoading(true);
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/imaging/partner-services?clinic_id=${encodeURIComponent(clinicId)}&center_id=${encodeURIComponent(centerId)}`,
          { headers },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'تعذر تحميل خدمات المركز');
        if (!cancelled) setServices(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل خدمات المركز');
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centerId, clinicId, authHeaders]);

  const submit = async () => {
    setError(null);
    if (!centerId) {
      setError('اختر مركز التصوير أولاً');
      return;
    }
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/imaging/referrals', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          target_imaging_center_id: centerId,
          patient_id: target.patientId,
          service_id: serviceId || null,
          requested_service: services.find((s) => s.id === serviceId)?.name ?? null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'فشل إرسال التحويل');
      onDone?.({ ok: true, message: 'تم إرسال طلب التحويل لمركز التصوير ✅' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إرسال التحويل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تحويل المريض لمركز تصوير"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">🩻 تحويل المريض لمركز تصوير</h2>
            <p className="mt-1 text-sm text-slate-400">المريض: {target.patientName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">مركز التصوير</span>
            <select
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={centers === null}
            >
              <option value="">{centers === null ? 'جارٍ التحميل…' : 'اختر المركز'}</option>
              {(acceptedCenters.length > 0 ? acceptedCenters : centers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.relationship_status && c.relationship_status !== 'accepted' ? ' (غير مرتبط)' : ''}
                </option>
              ))}
            </select>
            {centers !== null && acceptedCenters.length === 0 && (
              <span className="mt-1 block text-xs text-amber-400">
                لا توجد ارتباط مقبول مع مراكز تصوير — أضف الارتباط أولاً من صفحة الشركاء.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">نوع التصوير</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              disabled={!centerId || servicesLoading}
            >
              <option value="">{servicesLoading ? 'جارٍ التحميل…' : 'اختر نوع التصوير (اختياري)'}</option>
              {services
                .filter((s) => s.name)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">ملاحظات</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="مثال: تاريخ فحص سابق، منطقة مؤلمة…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              disabled={submitting}
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              disabled={submitting || !centerId}
            >
              {submitting ? 'جارٍ الإرسال…' : 'إرسال التحويل'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

