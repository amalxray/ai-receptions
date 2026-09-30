'use client';

import React, { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookText, CalendarDays, CheckCircle2, ChevronDown, Loader2, Plus, RotateCcw, Stethoscope, X } from 'lucide-react';
import { localIsoDate } from '@/lib/calendar/weeks';
import {
  PATIENT_TREATMENT_TYPES,
  sessionProgress,
  sessionProcedureTone,
  sessionStatusAr,
  type PatientSession,
  type PatientSessionDraft,
  type PatientSessionStatus,
} from '@/components/dashboard/patients/smartProfile';

/**
 * N26 — 🦷 الجلسات (the dental treatment plan).
 *
 * The plan lives in `patients.metadata.sessions` (no migration needed), so this
 * panel is the only place a session is created or moved between states. It also
 * carries the progress bar "ما تم / ما بقي" («3 من 6 جلسات»), a skeleton instead
 * of a text loading line, and per-procedure colours so a doctor can read a
 * treatment plan at a glance.
 */

export type PatientSessionsPanelProps = {
  sessions: PatientSession[];
  /** `full` = the 🦷 tab, `compact` = the overview glance. */
  variant?: 'full' | 'compact';
  /** True while the patient row itself is still loading. */
  loading?: boolean;
  /** Clinic id used to load the provider dropdown for the new session modal. */
  clinicId?: string;
  /** Auth headers for the provider dropdown. */
  authHeaders?: () => Promise<Record<string, string>>;
  /** Persists a new session; must reject to surface the failure in the modal. */
  onAdd?: (draft: PatientSessionDraft) => Promise<void>;
  /** Persists a status change (مكتملة / ملغاة / إرجاع إلى مخطّطة). */
  onStatusChange?: (session: PatientSession, status: PatientSessionStatus) => Promise<void>;
};

const QUICK_PROCEDURES = ['حشوة', 'علاج عصب', 'خلع', 'تلبيس', 'تنظيف'] as const;

/** planned first (soonest), then done (newest), then cancelled (newest). */
const STATUS_ORDER: Record<PatientSessionStatus, number> = { planned: 0, done: 1, cancelled: 2 };

export function sortSessions(sessions: readonly PatientSession[]): PatientSession[] {
  return [...sessions].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return a.status === 'planned'
      ? (a.date || '9999').localeCompare(b.date || '9999')
      : (b.date || '').localeCompare(a.date || '');
  });
}

function statusChip(status: PatientSessionStatus): string {
  const map: Record<PatientSessionStatus, string> = {
    done: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
    planned: 'bg-cyan-500/15 text-cyan-200 ring-cyan-500/30',
    cancelled: 'bg-slate-700/40 text-slate-300 ring-slate-600',
  };
  return map[status];
}

function SkeletonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`h-3.5 rounded-full bg-slate-800 ${wide ? 'w-40' : 'w-24'}`} />
        <div className="h-5 w-16 rounded-full bg-slate-800/80" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-24 rounded-full bg-slate-800/70" />
        <div className="h-6 w-16 rounded-full bg-slate-800/60" />
      </div>
      <div className="mt-3 h-9 w-44 rounded-full bg-slate-800/50" />
    </div>
  );
}

export function SessionsSkeleton({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="h-3.5 w-28 rounded-full bg-slate-800" />
        <div className="mt-3 h-3 w-full rounded-full bg-slate-800/70" />
      </div>
      {variant === 'full' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonRow />
          <SkeletonRow wide />
        </div>
      ) : (
        <SkeletonRow />
      )}
    </div>
  );
}

/** "ما تم / ما بقي" — the treatment progress rail. */
function TreatmentProgress({ sessions }: { sessions: PatientSession[] }) {
  const progress = useMemo(() => sessionProgress(sessions), [sessions]);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-end justify-between gap-1">
        <p className="text-sm font-semibold text-white">خطة العلاج</p>
        <p className="text-[11px] text-slate-400">
          ✅ {progress.done} تم · ⏳ {progress.remaining} بقي
          {progress.cancelled > 0 ? ` · ✖ ${progress.cancelled} ملغاة` : ''}
        </p>
      </div>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress.percent}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-emerald-300"
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
        <span className="text-cyan-200">{progress.label}</span>
        <span className="text-slate-400">{progress.percent}٪ مكتمل</span>
      </div>
    </div>
  );
}

/** Button with a glow rail and a ripple burst on every press. */
function RippleButton({
  children,
  onClick,
  disabled,
  className = '',
  glow = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  glow?: string;
}) {
  const [bursts, setBursts] = useState(0);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setBursts((count) => count + 1);
        onClick();
      }}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-3.5 py-2 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${glow} ${className}`}
    >
      <AnimatePresence>
        {bursts > 0 && (
          <motion.span
            key={bursts}
            aria-hidden
            initial={{ scale: 0, opacity: 0.45 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 rounded-full bg-white"
          />
        )}
      </AnimatePresence>
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
}

function FloatingField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`group relative block ${className}`}>
      <span className="pointer-events-none absolute right-3 top-3 z-10 text-[10px] font-bold text-slate-400 transition-all duration-200 group-focus-within:top-2 group-focus-within:text-cyan-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function PreviewCard({ draft, doctorLabel }: { draft: PatientSessionDraft; doctorLabel?: string }) {
  const tone = sessionProcedureTone(draft.treatment_type ?? (draft.service || 'حشوة'));
  return (
    <div className={`overflow-hidden rounded-2xl border p-4 ${tone.ring}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <span aria-hidden>{tone.emoji}</span>
          <span>{draft.service || 'إجراء غير محدد'}</span>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${statusChip(draft.status)}`}>
          {sessionStatusAr(draft.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200">
          {draft.treatment_type || 'أخرى'}
        </span>
        {draft.tooth ? <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200">سن {draft.tooth}</span> : null}
        {doctorLabel ? (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200">طبيب: {doctorLabel}</span>
        ) : null}
      </div>
      <div className="mt-4 space-y-2 text-xs text-slate-300">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
          <p className="mb-1 text-[10px] font-bold text-slate-400">ملاحظات</p>
          <p>{draft.note || 'لا توجد ملاحظات.'}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
          <p className="mb-1 text-[10px] font-bold text-slate-400">الخطة القادمة</p>
          <p>{draft.next_plan || 'لا توجد خطة محددة بعد الجلسة الحالية.'}</p>
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  busy,
  onStatusChange,
}: {
  session: PatientSession;
  busy: boolean;
  onStatusChange: (session: PatientSession, status: PatientSessionStatus) => void;
}) {
  const tone = sessionProcedureTone(session.treatment_type ?? session.service);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border p-4 ${tone.ring}`}
    >
      {/* Procedure accent: the colour a doctor recognises without reading. */}
      <span aria-hidden className={`absolute inset-y-0 right-0 w-1 ${tone.bar}`} />

      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-slate-100">
          <span aria-hidden>{tone.emoji}</span>
          {session.service}
        </p>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${statusChip(session.status)}`}>
          {sessionStatusAr(session.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-slate-200">
          <CalendarDays className="h-3 w-3" />
          {session.date || 'بدون تاريخ'}
        </span>
        <span className={`rounded-full px-2.5 py-1 font-bold ring-1 ${tone.chip}`}>
          {session.treatment_type ?? 'أخرى'}
        </span>
        {session.tooth ? (
          <span className={`rounded-full px-2.5 py-1 font-bold ring-1 ${tone.chip}`}>🦷 سن {session.tooth}</span>
        ) : null}
      </div>

      {session.doctor_id ? <p className="mt-2 text-[11px] text-slate-300">👨‍⚕️ الطبيب: {session.doctor_id}</p> : null}
      {session.next_plan ? <p className="mt-2 text-xs leading-relaxed text-cyan-100/90">📌 خطة قادمة: {session.next_plan}</p> : null}
      {session.note ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{session.note}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {session.status === 'planned' ? (
          <>
            <RippleButton
              glow={tone.glow}
              disabled={busy}
              onClick={() => onStatusChange(session, 'done')}
              className="bg-gradient-to-l from-emerald-400 to-cyan-400 text-slate-950"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              تسجيل جلسة مكتملة
            </RippleButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatusChange(session, 'cancelled')}
              className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-800 disabled:opacity-50"
            >
              إلغاء الجلسة
            </button>
          </>
        ) : (
          <RippleButton
            disabled={busy}
            onClick={() => onStatusChange(session, 'planned')}
            className="border border-slate-700 text-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {session.status === 'done' ? 'إرجاع إلى مخطّطة' : 'إعادة إلى الخطة'}
          </RippleButton>
        )}
      </div>
    </motion.article>
  );
}

export default function PatientSessionsPanel({
  sessions,
  variant = 'full',
  loading = false,
  clinicId,
  authHeaders,
  onAdd,
  onStatusChange,
}: PatientSessionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; title?: string | null }>>([]);
  const [draft, setDraft] = useState<PatientSessionDraft>(() => ({
    date: localIsoDate(new Date()),
    service: '',
    tooth: '',
    treatment_type: 'حشوة',
    doctor_id: '',
    next_plan: '',
    note: '',
    status: 'done',
  }));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId || !authHeaders) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/providers?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const list = Array.isArray(json?.data) ? json.data : [];
        if (!cancelled) setProviders(list as Array<{ id: string; name: string; title?: string | null }>);
      } catch {
        if (!cancelled) setProviders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId]);

  const sorted = useMemo(() => sortSessions(sessions), [sessions]);
  const shown = variant === 'compact' ? sorted.slice(0, 3) : sorted;
  const progress = useMemo(() => sessionProgress(sessions), [sessions]);
  const doctorLabel = providers.find((provider) => provider.id === draft.doctor_id)?.name ?? 'بدون طبيب';

  /** Success notes are transient so the timeline stays clean. */
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onAdd || saving) return;
    const service = draft.service.trim();
    if (!service) {
      setError('اكتب نوع الإجراء أولاً (حشوة، علاج عصب، خلع…)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        ...draft,
        service,
        treatment_type: draft.treatment_type || 'أخرى',
        date: draft.date || localIsoDate(new Date()),
      });
      setFeedback(`✅ تمت إضافة جلسة «${service}»`);
      setDraft({
        date: localIsoDate(new Date()),
        service: '',
        tooth: '',
        treatment_type: 'حشوة',
        doctor_id: '',
        next_plan: '',
        note: '',
        status: 'done',
      });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الجلسة — حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(session: PatientSession, status: PatientSessionStatus) {
    if (!onStatusChange || busyId) return;
    setBusyId(session.id);
    setError(null);
    try {
      await onStatusChange(session, status);
      setFeedback(
        status === 'done'
          ? `✅ تم تسجيل جلسة «${session.service}» كمكتملة`
          : status === 'cancelled'
            ? `تم إلغاء جلسة «${session.service}»`
            : `أُعيدت جلسة «${session.service}» إلى الخطة`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث الجلسة — حاول مرة أخرى');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            🦷 الجلسات{progress.total > 0 ? ` — ${progress.label}` : ''}
          </p>
          <p className="text-[11px] text-slate-500">خطة العلاج محفوظة داخل ملف المريض نفسه.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            setError(null);
          }}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
        >
          {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {open ? 'إغلاق' : 'إضافة جلسة'}
        </button>
      </div>

      {feedback && (
        <p role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          {feedback}
        </p>
      )}
      {error && !open && (
        <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <SessionsSkeleton variant={variant} />
      ) : (
        <>
          {sessions.length > 0 && <TreatmentProgress sessions={sessions} />}

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
              <p className="text-sm text-slate-300">لا جلسات مسجّلة بعد.</p>
              <p className="mt-1 text-xs text-slate-500">اضغط «إضافة جلسة» لتسجيل أول جلسة في خطة العلاج.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {shown.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  busy={busyId === session.id}
                  onStatusChange={(target, status) => void changeStatus(target, status)}
                />
              ))}
            </div>
          )}

          {variant === 'compact' && sorted.length > shown.length && (
            <p className="text-[11px] text-slate-500">
              و{sorted.length - shown.length} جلسات أخرى في تبويب «🦷 الجلسات».
            </p>
          )}
        </>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-md sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="إضافة جلسة"
          >
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 48, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="w-full max-w-5xl rounded-[1.75rem] border border-cyan-500/30 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-white">🦷 جلسة جديدة</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">تُحفظ داخل ملف المريض مباشرة.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                  className="rounded-full border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                      <BookText className="h-4 w-4 text-cyan-300" />
                      معلومات الجلسة
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                      {QUICK_PROCEDURES.map((name) => {
                        const tone = sessionProcedureTone(name);
                        const active = draft.service.trim() === name;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, service: name }))}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 transition ${
                              active ? tone.chip : 'bg-slate-800 text-slate-300 ring-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {tone.emoji} {name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FloatingField label="الإجراء" className="sm:col-span-2">
                        <input
                          value={draft.service}
                          onChange={(event) => setDraft((current) => ({ ...current, service: event.target.value }))}
                          placeholder=" "
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </FloatingField>

                      <FloatingField label="نوع العلاج">
                        <div className="relative">
                          <select
                            value={draft.treatment_type ?? 'أخرى'}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, treatment_type: event.target.value as PatientSession['treatment_type'] }))
                            }
                            className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-9 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                          >
                            {PATIENT_TREATMENT_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </FloatingField>

                      <FloatingField label="التاريخ">
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </FloatingField>

                      <FloatingField label="السن">
                        <input
                          value={draft.tooth ?? ''}
                          onChange={(event) => setDraft((current) => ({ ...current, tooth: event.target.value }))}
                          placeholder=" "
                          className="w-full rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </FloatingField>

                      <FloatingField label="الطبيب" className="sm:col-span-2">
                        <div className="relative">
                          <select
                            value={draft.doctor_id ?? ''}
                            onChange={(event) => setDraft((current) => ({ ...current, doctor_id: event.target.value || undefined }))}
                            disabled={!clinicId || providers.length === 0}
                            className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-9 text-sm text-slate-100 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                          >
                            <option value="">{clinicId ? 'اختر الطبيب' : 'غير متاح'}</option>
                            {providers.map((provider) => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name}
                                {provider.title ? ` · ${provider.title}` : ''}
                              </option>
                            ))}
                          </select>
                          <Stethoscope className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                        {doctorLabel && <span className="mt-1 block text-[10px] text-slate-400">{doctorLabel}</span>}
                      </FloatingField>

                      <div className="sm:col-span-2">
                        <p className="mb-2 text-[10px] font-bold text-slate-400">الحالة</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(['done', 'planned', 'cancelled'] as PatientSessionStatus[]).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setDraft((current) => ({ ...current, status }))}
                              className={`rounded-xl border px-3 py-2 text-center text-xs font-bold transition ${
                                draft.status === status
                                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100 shadow-lg shadow-cyan-500/10'
                                  : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                              }`}
                            >
                              {status === 'done' ? 'مكتملة' : status === 'planned' ? 'مخططة' : 'ملغاة'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                      <BookText className="h-4 w-4 text-violet-300" />
                      ملاحظات
                    </div>
                    <div className="space-y-3">
                      <FloatingField label="ملاحظات الجلسة">
                        <textarea
                          value={draft.note ?? ''}
                          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                          rows={3}
                          placeholder=" "
                          className="w-full resize-y rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </FloatingField>

                      <FloatingField label="خطة الجلسة القادمة">
                        <textarea
                          value={draft.next_plan ?? ''}
                          onChange={(event) => setDraft((current) => ({ ...current, next_plan: event.target.value }))}
                          rows={3}
                          placeholder=" "
                          className="w-full resize-y rounded-xl border border-slate-800 bg-slate-950 pt-6 pb-2.5 pr-3 pl-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </FloatingField>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <CalendarDays className="h-4 w-4 text-emerald-300" />
                    معاينة مباشرة
                  </div>
                  <PreviewCard draft={draft} doctorLabel={doctorLabel} />
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                  {error}
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-l from-emerald-400 to-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {saving ? 'جارٍ الحفظ…' : 'حفظ الجلسة'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
