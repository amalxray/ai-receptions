'use client';

import React, { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, Plus, User, X } from 'lucide-react';
import { appointmentStatusAr, formatTimeAr } from '@/lib/dashboard/labels-ar';
import { addDaysIso, dateFromIso, localIsoDate } from '@/lib/calendar/weeks';

/**
 * B23 — patient appointment panel.
 *
 * Why this file exists: the patient file could only ever READ appointments, and
 * the overview printed them as bare text lines. This panel adds the missing
 * "➕ إضافة موعد" action (patient pre-filled), renders every appointment as a
 * card, and gives the doctor instant visual feedback on success/failure.
 *
 * The time is the whole point of B23: `POST /api/appointments` now receives
 * `appointment_time` and persists it as `scheduled_at`, so a card shows the time
 * that was actually chosen instead of the old hardcoded 09:00.
 */

export type PatientAppointmentRow = {
  id: string | number;
  service: string | null;
  appointment_date: string;
  appointment_time: string | null;
  status: string;
  provider_name?: string | null;
};

export interface PatientAppointmentsPanelProps {
  clinicId: string | null;
  patientId: string;
  patientName?: string;
  appointments: PatientAppointmentRow[];
  loading?: boolean;
  authHeaders: () => Promise<Record<string, string>>;
  /** `full` = the 📅 tab, `compact` = the overview summary. */
  variant?: 'full' | 'compact';
  /** Lets the shell append the created row to its own list. */
  onCreated?: (created: PatientAppointmentRow) => void;
}

const ACTIVE_STATUSES = ['scheduled', 'confirmed', 'pending'];

/** "اليوم" / "غداً" / "بعد 3 أيام" — local-date maths, never UTC shifts. */
export function relativeDayLabelAr(dateIso: string, todayIso: string): string {
  const target = dateFromIso(dateIso);
  const today = dateFromIso(todayIso);
  if (Number.isNaN(target.getTime()) || Number.isNaN(today.getTime())) return '';
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === -1) return 'أمس';
  return diff > 1 ? `بعد ${diff} أيام` : `قبل ${Math.abs(diff)} أيام`;
}

/**
 * Default slot for a new appointment: the next half hour, rolling to tomorrow
 * when the "next half hour" would fall past midnight.
 */
export function defaultSlotFor(now: Date = new Date()): { date: string; time: string } {
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil((totalMinutes + 1) / 30) * 30;
  const overflow = rounded >= 24 * 60;
  const minutes = overflow ? 0 : rounded;
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  const today = localIsoDate(now);
  return { date: overflow ? addDaysIso(today, 1) : today, time: `${hours}:${mins}` };
}

/** Splits rows into upcoming (soonest first) and past (newest first). */
export function splitAppointments(
  rows: PatientAppointmentRow[],
  todayIso: string
): { upcoming: PatientAppointmentRow[]; past: PatientAppointmentRow[] } {
  const key = (row: PatientAppointmentRow) => `${row.appointment_date ?? ''} ${row.appointment_time ?? ''}`;
  const active = rows.filter((row) => ACTIVE_STATUSES.includes(row.status));
  const upcoming = active
    .filter((row) => (row.appointment_date ?? '') >= todayIso)
    .sort((a, b) => key(a).localeCompare(key(b)));
  const past = rows
    .filter((row) => !upcoming.includes(row))
    .sort((a, b) => key(b).localeCompare(key(a)));
  return { upcoming, past };
}

function statusClasses(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    completed: 'bg-cyan-500/15 text-cyan-200 ring-cyan-500/30',
    scheduled: 'bg-sky-500/15 text-sky-200 ring-sky-500/30',
    pending: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
    cancelled: 'bg-red-500/15 text-red-300 ring-red-500/30',
    no_show: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  };
  return map[status] ?? 'bg-slate-800 text-slate-300 ring-slate-700';
}

function AppointmentCard({
  row,
  todayIso,
  highlighted,
}: {
  row: PatientAppointmentRow;
  todayIso: string;
  highlighted?: boolean;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 transition ${
        highlighted ? 'border-cyan-400/60 bg-cyan-500/10 ring-2 ring-cyan-400/40' : 'border-slate-800 bg-slate-950/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-100">🦷 {row.service || 'خدمة غير محددة'}</span>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusClasses(row.status)}`}>
          {appointmentStatusAr(row.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-slate-200">
          <CalendarDays className="h-3 w-3" />
          {row.appointment_date || 'بدون تاريخ'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 font-bold text-cyan-200">
          <Clock3 className="h-3 w-3" />
          {formatTimeAr(row.appointment_time ?? '') || 'بدون وقت'}
        </span>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-slate-400">
          {relativeDayLabelAr(row.appointment_date, todayIso)}
        </span>
      </div>

      {row.provider_name ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
          <User className="h-3 w-3" /> {row.provider_name}
        </p>
      ) : null}
      {highlighted ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300">
          <CheckCircle2 className="h-3 w-3" /> أُضيف الآن
        </p>
      ) : null}
    </motion.article>
  );
}

export default function PatientAppointmentsPanel({
  clinicId,
  patientId,
  patientName,
  appointments,
  loading = false,
  authHeaders,
  variant = 'full',
  onCreated,
}: PatientAppointmentsPanelProps) {
  const [services, setServices] = useState<string[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => {
    const slot = defaultSlotFor();
    return { service: '', appointment_date: slot.date, appointment_time: slot.time, status: 'scheduled' };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const todayIso = useMemo(() => localIsoDate(new Date()), []);
  const { upcoming, past } = useMemo(() => splitAppointments(appointments, todayIso), [appointments, todayIso]);

  const loadServices = useCallback(async () => {
    if (!clinicId) return;
    setServicesLoading(true);
    try {
      // Same public endpoint the booking page uses — the doctor picks a real service.
      const res = await fetch(`/api/booking/services?clinic_id=${encodeURIComponent(clinicId)}`);
      const payload = await res.json().catch(() => null);
      const list = Array.isArray(payload?.data?.services) ? payload.data.services : [];
      const names = list
        .map((service: { name?: unknown }) => (typeof service?.name === 'string' ? service.name.trim() : ''))
        .filter((name: string) => name.length > 0);
      setServices(names);
      setForm((current) => (current.service || names.length === 0 ? current : { ...current, service: names[0] }));
    } catch {
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (!open || services.length > 0) return;
    void loadServices();
  }, [open, services.length, loadServices]);

  /** Success note and the "أُضيف الآن" ring are transient — they must not linger. */
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinicId || saving) return;
    if (!form.service.trim()) {
      setError('اختر الخدمة أولاً');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: patientId,
          service: form.service.trim(),
          appointment_date: form.appointment_date,
          // B23 — the chosen time MUST travel with the request; the API stores it
          // as `scheduled_at`, which is what every reader displays.
          appointment_time: form.appointment_time,
          duration_minutes: 30,
          status: form.status,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) throw new Error('انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة');
        if (res.status === 409) throw new Error(typeof payload?.error === 'string' ? payload.error : 'هذا الوقت محجوز — اختر وقتاً آخر');
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'تعذر حفظ الموعد — حاول مرة أخرى');
      }
      const created = payload?.data ?? payload;
      const row: PatientAppointmentRow = {
        id: created?.id ?? `local-${Date.now()}`,
        service: created?.service ?? form.service.trim(),
        appointment_date: created?.appointment_date ?? form.appointment_date,
        appointment_time: created?.appointment_time ?? form.appointment_time,
        status: created?.status ?? form.status,
        provider_name: created?.provider_name ?? null,
      };
      onCreated?.(row);
      setHighlightId(String(row.id));
      setFeedback(`✅ تم حفظ الموعد: ${row.service} — ${row.appointment_date} في ${formatTimeAr(row.appointment_time ?? '')}`);
      const slot = defaultSlotFor();
      setForm({ service: form.service, appointment_date: slot.date, appointment_time: slot.time, status: 'scheduled' });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الموعد — حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  }

  const limit = variant === 'compact' ? 3 : 50;
  const upcomingShown = upcoming.slice(0, limit);
  const pastShown = variant === 'compact' ? [] : past.slice(0, limit);
  const completedCount = appointments.filter((row) => row.status === 'completed').length;
  const closedCount = appointments.filter((row) => row.status === 'cancelled' || row.status === 'no_show').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            📅 المواعيد{upcoming.length > 0 ? ` — ${upcoming.length} قادم` : ''}
          </p>
          <p className="text-[11px] text-slate-500">
            {patientName ? `جدولة موعد جديد في ملف ${patientName}` : 'جدولة موعد جديد لهذا المريض'}
          </p>
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
          {open ? 'إغلاق' : 'إضافة موعد'}
        </button>
      </div>

      {feedback && (
        <p role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          {feedback}
        </p>
      )}

      {variant === 'full' && (
        <div className="grid grid-cols-3 gap-2">
          <AppointmentKpi label="قادمة" value={upcoming.length} tone="text-cyan-300" />
          <AppointmentKpi label="مكتملة" value={completedCount} tone="text-emerald-300" />
          <AppointmentKpi label="ملغاة / لم يحضر" value={closedCount} tone="text-rose-300" />
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={submit} className="rounded-2xl border border-cyan-500/30 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-white">➕ موعد جديد</p>
              <p className="mt-1 text-[11px] text-slate-500">الوقت يُحفظ فعلياً مع الموعد — لا مزيد من 09:00 الثابتة.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">
                  الخدمة
                  <select
                    value={form.service}
                    onChange={(event) => setForm((current) => ({ ...current, service: event.target.value }))}
                    disabled={servicesLoading}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    <option value="">{servicesLoading ? 'جارٍ تحميل الخدمات...' : 'اختر الخدمة'}</option>
                    {services.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  الحالة
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="scheduled">قيد الجدولة</option>
                    <option value="confirmed">مؤكد</option>
                    <option value="pending">قيد الانتظار</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  التاريخ
                  <input
                    type="date"
                    value={form.appointment_date}
                    onChange={(event) => setForm((current) => ({ ...current, appointment_date: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>
                <label className="text-xs font-semibold text-slate-300">
                  الوقت
                  <input
                    type="time"
                    value={form.appointment_time}
                    onChange={(event) => setForm((current) => ({ ...current, appointment_time: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </label>
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                  {error}
                </p>
              )}

              {!servicesLoading && services.length === 0 && (
                <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  لا توجد خدمات مفعّلة لهذه العيادة — أضف خدمة من صفحة «الخدمات» قبل إنشاء موعد.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || services.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {saving ? 'جارٍ الحفظ…' : 'حفظ الموعد'}
                </button>
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
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <AlertCircle className="h-3 w-3" /> المريض مرتبط تلقائياً بهذا الملف
                </span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-sm text-slate-400">جارٍ تحميل المواعيد...</p>
      ) : upcomingShown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
          <p className="text-sm text-slate-300">لا مواعيد قادمة لهذا المريض.</p>
          <p className="mt-1 text-xs text-slate-500">اضغط «إضافة موعد» لجدولة زيارة جديدة.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {upcomingShown.map((row) => (
            <AppointmentCard key={row.id} row={row} todayIso={todayIso} highlighted={String(row.id) === highlightId} />
          ))}
        </div>
      )}

      {pastShown.length > 0 && (
        <div className="pt-1">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">الزيارات السابقة ({past.length})</p>
          <div className="grid gap-3 md:grid-cols-2">
            {pastShown.map((row) => (
              <AppointmentCard key={row.id} row={row} todayIso={todayIso} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentKpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-center">
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}
