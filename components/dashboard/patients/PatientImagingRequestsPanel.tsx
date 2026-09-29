'use client';

// React is imported explicitly (like SmartPatientProfile / the sessions panel)
// so this panel can be server-rendered in unit tests exactly as the server
// ships it — the imaging patient-file tab must never be a client-only blank.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, ExternalLink, RefreshCw, ShieldAlert, X } from 'lucide-react';
import StatusPill from '@/components/dashboard/StatusPill';
import { Ripple } from '@/components/ui/ripple';
import {
  imagingTypeLabel,
  isReferralTerminal,
  referralPriorityLabel,
  referralStatusLabel,
  referralStatusTone,
} from '@/lib/services/referralWorkflow';
import {
  belongsToPatient,
  counterpartyActivityLabel,
  counterpartyName,
  filterImagingRequests,
  groupImagingRequestsByPeriod,
  imagingRequestPeriod,
  imagingRequestTimestamp,
  IMAGING_PERIOD_LABELS_AR,
  IMAGING_PERIOD_ORDER,
  summarizeImagingRequests,
  type ImagingRequestPartners,
  type ImagingRequestPeriod,
  type ImagingRequestRow,
  type ImagingRequestStatusFilter,
} from '@/lib/services/imagingPatientFile';

/**
 * N30 — «🩹 طلبات الأشعة» inside the patient file of an IMAGING CENTER.
 *
 * The old file showed a dental treatment timeline (🦷) to a radiology center
 * whose real day job is the referral inbox. This panel is the patient-scoped
 * view of `imaging_requests`: what was requested, by WHICH referring clinic,
 * when, in what state — grouped by اليوم / هذا الأسبوع / هذا الشهر / أقدم so
 * staff can answer "شو وصلنا اليوم لهذا المريض؟" without leaving the file.
 *
 * Data comes from the same guarded route the inbox uses (direction=all so both
 * the incoming referral and any outgoing one show), narrowed server-side by
 * `patient_id` and re-checked client-side (B48 discipline: never render another
 * patient's row because a deployment ignored a filter).
 */

export interface PatientImagingRequestsPanelProps {
  clinicId: string;
  patientId: string;
  authHeaders: () => Promise<Record<string, string>>;
  /** Reported to the smart profile so its 📨 counter matches this tab. */
  onCountChange?: (count: number) => void;
  /** Jump to the studies tab (the files this request is expected to produce). */
  onOpenStudies?: () => void;
  /** Tenant slug, only used for the "open the inbox" shortcut. */
  clinicSlug?: string | null;
}

type PeriodFilter = 'all' | ImagingRequestPeriod;

/** StatusPill tones → the card's accent colour. */
const TONE_ACCENT: Record<'success' | 'warning' | 'danger' | 'neutral', string> = {
  success: 'border-l-emerald-400/70',
  warning: 'border-l-amber-400/70',
  danger: 'border-l-rose-400/70',
  neutral: 'border-l-slate-500/70',
};

export default function PatientImagingRequestsPanel({
  clinicId,
  patientId,
  authHeaders,
  onCountChange,
  onOpenStudies,
  clinicSlug,
}: PatientImagingRequestsPanelProps) {
  const [rows, setRows] = useState<ImagingRequestRow[]>([]);
  const [partners, setPartners] = useState<ImagingRequestPartners>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<ImagingRequestStatusFilter>('all');
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Kept in a ref: a caller passing an inline arrow must not re-create the
   * loader (fetch → setState → render loop).
   */
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const load = useCallback(async () => {
    if (!clinicId || !patientId) return;
    setLoading(true);
    setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&direction=all&patient_id=${encodeURIComponent(patientId)}`,
        { headers }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'تعذر تحميل طلبات الأشعة');
      const data: ImagingRequestRow[] = Array.isArray(json?.data) ? (json.data as ImagingRequestRow[]) : [];
      const mine = data.filter((row) => belongsToPatient(row, patientId));
      setRows(mine);
      setPartners((json?.partners ?? {}) as ImagingRequestPartners);
      onCountChangeRef.current?.(mine.length);
    } catch (e) {
      setRows([]);
      setPartners({});
      setErr(e instanceof Error ? e.message : 'فشل في تحميل طلبات الأشعة');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, patientId, authHeaders, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeImagingRequests(rows), [rows]);

  const statusFiltered = useMemo(() => filterImagingRequests(rows, statusFilter), [rows, statusFilter]);

  const periodCounts = useMemo(() => {
    const counts = new Map<ImagingRequestPeriod, number>();
    for (const row of statusFiltered) {
      const key = imagingRequestPeriod(row.created_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [statusFiltered]);

  const shown = useMemo(
    () => (period === 'all' ? statusFiltered : statusFiltered.filter((r) => imagingRequestPeriod(r.created_at) === period)),
    [statusFiltered, period]
  );

  const groups = useMemo(() => groupImagingRequestsByPeriod(shown), [shown]);
  const filtered = period !== 'all' || statusFilter !== 'all';


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-100">
              <span>🩹 طلبات الأشعة</span>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                {rows.length} طلب
              </span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              الطلبات الواردة من العيادات المحوِّلة والصادرة لهذا المريض، مرتّبة زمنيًا حسب اليوم والأسبوع والشهر.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenStudies && (
              <button
                type="button"
                onClick={onOpenStudies}
                className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-200 transition hover:bg-purple-500/20"
              >
                <span>🩻</span>
                <span>الدراسات</span>
              </button>
            )}
            {clinicSlug && (
              <Link
                href={`/dashboard/${clinicSlug}/imaging-requests`}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>صندوق الطلبات</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
              title="تحديث الطلبات"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Counters: الإجمالي / نشِطة / عاجلة / مكتملة */}
        <div className="relative mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarClock className="h-3.5 w-3.5 text-cyan-400" />
              <span>الإجمالي</span>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-100">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>نشِطة</span>
            </div>
            <p className="mt-1 text-xl font-bold text-amber-200">{summary.active}</p>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            {summary.urgent > 0 && (
              <span className="pointer-events-none absolute left-3 top-3 block h-2.5 w-2.5">
                <Ripple color="#F59E0B" number={2} />
              </span>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span>عاجلة</span>
            </div>
            <p className="mt-1 text-xl font-bold text-rose-200">{summary.urgent}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>مكتملة</span>
            </div>
            <p className="mt-1 text-xl font-bold text-emerald-200">{summary.done}</p>
          </div>
        </div>
      </div>

      {/* Filters: period + status */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 font-medium transition ${
              period === 'all'
                ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            الكل ({statusFiltered.length})
          </button>
          {IMAGING_PERIOD_ORDER.map((p) => {
            const count = periodCounts.get(p) ?? 0;
            if (count === 0 && period !== p) return null;
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 font-medium transition ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                    : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{IMAGING_PERIOD_LABELS_AR[p]}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${
                    active ? 'bg-cyan-500/40 text-cyan-100' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {(
            [
              ['all', 'كل الحالات'],
              ['active', 'نشِطة'],
              ['done', 'مكتملة / مغلقة'],
            ] as [ImagingRequestStatusFilter, string][]
          ).map(([key, label]) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 font-medium transition ${
                  active
                    ? 'bg-slate-700 text-white ring-1 ring-slate-500/50'
                    : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>



      {err && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
            <span>{err}</span>
          </div>
          <button type="button" onClick={() => setErr(null)} className="text-red-400 hover:text-red-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/40"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-2xl">
            🩹
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-200">لا توجد طلبات أشعة لهذا المريض بعد</p>
          <p className="mt-1 text-xs text-slate-500">
            ستظهر هنا أي عيادة تُحوِّل هذا المريض لتصوير، مع حالتها لحظة بلحظة.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
          <p className="text-sm font-semibold text-slate-200">لا نتائج مطابقة للفلاتر</p>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} طلب في المجموع — جرّب تغيير الفترة أو الحالة.
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setPeriod('all');
                setStatusFilter('all');
              }}
              className="mt-3 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.period} className="space-y-2">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-bold text-slate-300">{IMAGING_PERIOD_LABELS_AR[group.period]}</h4>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  {group.rows.length}
                </span>
                <span className="h-px flex-1 bg-slate-800" />
              </div>
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
                className="space-y-3"
              >
                <AnimatePresence initial={false}>
                  {group.rows.map((row) => (
                    <RequestCard key={row.id} row={row} clinicId={clinicId} partners={partners} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Arabic short date, never an empty cell. */
function formatStamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One referral, coloured by its workflow state. Urgent ACTIVE requests pulse
 * (Ripple) because that is the one thing a radiology desk must never miss.
 */
function RequestCard({
  row,
  clinicId,
  partners,
}: {
  row: ImagingRequestRow;
  clinicId: string;
  partners: ImagingRequestPartners;
}) {
  const tone = referralStatusTone(row.status);
  const stamp = imagingRequestTimestamp(row);
  const urgent = row.priority === 'urgent' && !isReferralTerminal(row.status);

  return (
    <motion.div
      layout
      variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-2xl border border-l-4 border-slate-800 ${TONE_ACCENT[tone]} bg-slate-900/70 p-4 shadow-sm backdrop-blur-sm transition-all duration-200`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-100">
            {imagingTypeLabel(row.modality, row.requested_service)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            🏥 {counterpartyName(clinicId, row, partners)} • {counterpartyActivityLabel(clinicId, row, partners)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urgent ? (
            <span className="relative inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">
              <span className="relative block h-1.5 w-1.5">
                <Ripple color="#F59E0B" number={2} />
              </span>
              عاجل
            </span>
          ) : (
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-300">
              {referralPriorityLabel(row.priority)}
            </span>
          )}
          <StatusPill tone={tone}>{referralStatusLabel(row.status)}</StatusPill>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>
          📅 {stamp.label}: {formatStamp(stamp.value)}
        </span>
        {row.patient_ref && <span>مرجع المريض: {row.patient_ref}</span>}
        {row.imaging_status && <span>حالة التصوير: {row.imaging_status}</span>}
      </div>

      {row.notes && (
        <p className="mt-2 max-h-12 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-2 text-[11px] leading-relaxed text-slate-300">
          {row.notes}
        </p>
      )}
    </motion.div>
  );
}

