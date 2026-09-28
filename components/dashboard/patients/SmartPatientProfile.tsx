'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  MessageCircle,
  FileText,
  Calendar,
  Files,
  ArrowRightLeft,
  Receipt,
  CheckCircle2,
  Clock,
  Hourglass,
  AlertTriangle,
  User,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { calculatePatientAge, formatAgeAr } from '@/lib/patientAge';
import { formatTimeAr } from '@/lib/dashboard/labels-ar';
// B38/B39 — the profile reads the shared phone normalizer and the defensive
// metadata reader instead of re-implementing either next to the component.
import {
  normalizePhoneForWhatsApp,
  parsePatientMetadata,
  type QuickNote,
} from '@/components/dashboard/patients/smartProfile';

export type SmartPatientData = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  metadata?: {
    date_of_birth?: string | null;
    critical_alert?: string | null;
    alerts?: string[];
    [key: string]: unknown;
  } | null;
};

export type SmartAppointment = {
  id: string;
  service: string;
  appointment_date: string;
  appointment_time?: string | null;
  status: string;
  provider_name?: string | null;
};

export type SmartPatientStats = {
  visitsCount: number;
  filesCount: number;
  referralsCount: number;
  invoicesCount: number;
};

export type SmartTimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  time?: string;
  status: 'completed' | 'in_progress' | 'remaining' | 'cancelled';
  /** Kept in sync with `smartProfile.ts#SmartTimelineItem` so either can be passed in. */
  iconType?: 'visit' | 'file' | 'referral' | 'invoice' | 'note' | 'medical';
};

interface SmartPatientProfileProps {
  patient: SmartPatientData;
  stats: SmartPatientStats;
  appointments?: SmartAppointment[];
  timelineItems?: SmartTimelineItem[];
  onOpenVisits?: () => void;
  onOpenFiles?: () => void;
  onOpenReferrals?: () => void;
  onOpenInvoices?: () => void;
  onOpenTimelineDetail?: (item: SmartTimelineItem) => void;
  /**
   * B39 — persists a quick note (`metadata.quick_notes`). Throwing rejects keep
   * the composer open and surface the message under the textarea.
   */
  onSaveQuickNote?: (text: string) => Promise<void> | void;
}

function formatDateAr(iso: string | null | undefined): string {
  if (!iso) return 'بدون تاريخ';
  try {
    return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('ar', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function MultiStateActionButton({
  icon: Icon,
  label,
  subLabel,
  color,
  badgeLetter,
  onClick,
  href,
}: {
  icon: React.ElementType;
  label: string;
  subLabel?: string;
  color: 'emerald' | 'blue' | 'purple';
  badgeLetter?: string;
  onClick?: () => void;
  href?: string;
}) {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  const colorStyles = {
    emerald: {
      bg: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border-emerald-200/80',
      glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]',
      iconBg: 'bg-emerald-500 text-white',
      badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-300/40',
      ripple: 'bg-emerald-400/40',
    },
    blue: {
      bg: 'bg-blue-50 text-blue-700 hover:bg-blue-100/80 border-blue-200/80',
      glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.25)]',
      iconBg: 'bg-blue-500 text-white',
      badge: 'bg-blue-500/10 text-blue-700 border-blue-300/40',
      ripple: 'bg-blue-400/40',
    },
    purple: {
      bg: 'bg-purple-50 text-purple-700 hover:bg-purple-100/80 border-purple-200/80',
      glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]',
      iconBg: 'bg-purple-500 text-white',
      badge: 'bg-purple-500/10 text-purple-700 border-purple-300/40',
      ripple: 'bg-purple-400/40',
    },
  }[color];

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { x, y, id: Date.now() };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);

    if (onClick) onClick();
  };

  const Content = (
    <motion.div
      onClick={handleClick}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border px-3.5 py-2.5 font-medium shadow-sm transition-all duration-300 ${colorStyles.bg} ${colorStyles.glow} cursor-pointer`}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full ${colorStyles.ripple}`}
          style={{
            left: r.x,
            top: r.y,
            width: 80,
            height: 80,
            animationDuration: '600ms',
            animationIterationCount: 1,
          }}
        />
      ))}

      <div className="flex items-center gap-2.5">
        <motion.div
          whileHover={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.5 }}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${colorStyles.iconBg}`}
        >
          <Icon className="h-4 w-4" />
        </motion.div>
        <div className="text-right">
          <p className="text-xs font-bold leading-none">{label}</p>
          {subLabel && <p className="mt-0.5 text-[10px] opacity-75 leading-none">{subLabel}</p>}
        </div>
      </div>

      {badgeLetter && (
        <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${colorStyles.badge}`}>
          {badgeLetter}
        </span>
      )}
    </motion.div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block focus:outline-none">
        {Content}
      </a>
    );
  }

  return Content;
}

export default function SmartPatientProfile({
  patient,
  stats,
  appointments = [],
  timelineItems = [],
  onOpenVisits,
  onOpenFiles,
  onOpenReferrals,
  onOpenInvoices,
  onOpenTimelineDetail,
  onSaveQuickNote,
}: SmartPatientProfileProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  // B39 — the quick-note composer used to share the `noteExpanded` toggle, and
  // the whole notes block was gated on `patient.notes`, so for a patient with no
  // stored notes clicking "ملاحظة سريعة" did literally nothing.
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const quickNotes: QuickNote[] = parsePatientMetadata(patient.metadata).quick_notes;

  // B38 — wa.me needs country-code digits. A local 05XXXXXXXX used to be pasted
  // verbatim (https://wa.me/0599123456) and WhatsApp reported the number as
  // invalid; normalizePhoneForWhatsApp prefixes +970 and drops the leading 0.
  const whatsappTarget = normalizePhoneForWhatsApp(patient.phone);

  async function submitQuickNote() {
    const text = noteDraft.trim();
    if (!text) return;
    if (!onSaveQuickNote) {
      setNoteError('حفظ الملاحظات غير متوفر في هذه الشاشة');
      return;
    }
    setNoteSaving(true);
    setNoteError(null);
    try {
      await onSaveQuickNote(text);
      setNoteDraft('');
      setComposerOpen(false);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'تعذر حفظ الملاحظة');
    } finally {
      setNoteSaving(false);
    }
  }

  const dob =
    patient.metadata?.date_of_birth ||
    (patient as unknown as { date_of_birth?: string }).date_of_birth ||
    null;
  const ageResult = calculatePatientAge(dob);

  const criticalAlert =
    patient.metadata?.critical_alert ||
    (patient.metadata?.alerts && Array.isArray(patient.metadata.alerts) && patient.metadata.alerts[0]) ||
    (patient.notes && patient.notes.includes('حساسية') ? patient.notes : null);

  const pastAppointments = [...appointments]
    .filter((a) => a.status === 'completed')
    .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
  const lastVisit = pastAppointments[0];

  const appointmentTimeline: SmartTimelineItem[] =
    timelineItems.length > 0
      ? timelineItems
      : appointments.map((appt) => {
          let status: SmartTimelineItem['status'] = 'in_progress';
          if (appt.status === 'completed') status = 'completed';
          else if (appt.status === 'cancelled') status = 'cancelled';
          else if (appt.status === 'confirmed' || appt.status === 'scheduled') status = 'remaining';

          return {
            id: appt.id,
            title: appt.service || 'موعد في العيادة',
            subtitle: appt.provider_name ? `مع د. ${appt.provider_name}` : undefined,
            date: appt.appointment_date,
            time: appt.appointment_time || undefined,
            status,
            iconType: 'visit',
          };
        });

  // B39 — every quick note is a timeline event ("الخط الزمني يسجّل كل إضافة").
  // Only merged on the self-built path: a parent that passes `timelineItems`
  // owns the event list and would otherwise see notes duplicated.
  const noteTimeline: SmartTimelineItem[] =
    timelineItems.length > 0
      ? []
      : quickNotes.map((note, index) => {
          const stamp = note.date || '';
          const hasClock = stamp.length > 10;
          return {
            id: `note-${index}-${stamp}`,
            title: 'ملاحظة طبية',
            subtitle: note.by ? `${note.text} · ${note.by}` : note.text,
            date: hasClock ? stamp.slice(0, 10) : stamp,
            time: hasClock ? stamp.slice(11, 16) : undefined,
            status: 'completed' as const,
            iconType: 'note' as const,
          };
        });

  const timeline: SmartTimelineItem[] = [...appointmentTimeline, ...noteTimeline].sort((a, b) =>
    `${b.date}${b.time ?? ''}`.localeCompare(`${a.date}${a.time ?? ''}`)
  );

  return (
    <div
      dir="rtl"
      className="relative w-full overflow-hidden rounded-3xl bg-[#F8FAFC] p-3 text-slate-800 antialiased sm:p-6 lg:p-8"
    >
      {/* Dynamic Animated Blobs in the Light Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: [0, 20, -15, 0],
            y: [0, -25, 10, 0],
            scale: [1, 1.08, 0.95, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -30, 15, 0],
            y: [0, 20, -15, 0],
            scale: [1, 0.92, 1.1, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-20 top-1/4 h-[28rem] w-[28rem] rounded-full bg-blue-200/35 blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, 25, -20, 0],
            y: [0, 30, -20, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 right-1/4 h-80 w-80 rounded-full bg-purple-200/25 blur-3xl"
        />
      </div>

      <div className="relative mx-auto max-w-4xl space-y-6">
        {/* ============================================================== */}
        {/* LEVEL 1: IMMEDIATE SUMMARY CARD (5 SECONDS OVERVIEW)           */}
        {/* ============================================================== */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="group relative rounded-3xl p-[2px] transition-all duration-300"
          style={{
            background:
              'conic-gradient(from 180deg at 50% 50%, #10B981 0deg, #3B82F6 90deg, #8B5CF6 180deg, #F59E0B 270deg, #10B981 360deg)',
          }}
        >
          <div className="relative rounded-[22px] bg-white/95 p-5 shadow-lg shadow-slate-200/60 backdrop-blur-md sm:p-7">
            {/* Background Blob behind main card */}
            <div className="pointer-events-none absolute -left-10 -top-10 h-44 w-44 rounded-full bg-gradient-to-br from-blue-300/20 to-purple-300/20 blur-2xl" />

            {/* Critical Alert Bar */}
            {criticalAlert && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3 text-red-700 shadow-sm"
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm"
                >
                  <AlertTriangle className="h-4 w-4" />
                </motion.div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-red-800">تنبيه طبي حرج:</span>
                    <span className="rounded-md bg-red-200/60 px-1.5 py-0.5 text-[10px] font-extrabold text-red-900">
                      عاجل
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-red-700/90 leading-relaxed">{criticalAlert}</p>
                </div>
              </motion.div>
            )}

            {/* Profile Header: Photo + Name + Prominent Age Blob */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <motion.div
                    whileHover={{ scale: 1.05, rotate: 3 }}
                    className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 text-white shadow-md shadow-blue-500/20"
                  >
                    <User className="h-9 w-9 sm:h-11 sm:w-11" />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-[10px] text-white font-bold">
                      ✓
                    </span>
                  </motion.div>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {patient.name}
                    </h1>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      {patient.status || 'نشط'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>المصدر: {patient.source || 'موقع الويب'}</span>
                    <span>•</span>
                    <span>سُجّل في: {formatDateAr(patient.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* PROMINENT AGE BLOB */}
              {ageResult && (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.06 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                  className="relative self-start sm:self-auto overflow-hidden rounded-2xl p-[1.5px] shadow-lg shadow-purple-500/15"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6, #EC4899, #F59E0B)',
                  }}
                >
                  <div className="relative flex items-center gap-2 rounded-[14px] bg-white/95 px-4 py-2.5 backdrop-blur-md">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-lg">
                      🎂
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700">
                        العمر
                      </span>
                      <span className="text-base font-extrabold text-slate-900">
                        {formatAgeAr(ageResult)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Status & Last Visit Summary Bar */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl bg-slate-50/80 p-3 border border-slate-200/70 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="font-semibold text-slate-900">آخر زيارة:</span>
                <span>
                  {lastVisit
                    ? `${formatDateAr(lastVisit.appointment_date)} (${lastVisit.service})`
                    : 'لا توجد زيارات سابقة'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="font-semibold text-slate-900">حالة الملف:</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  محدّث وجاهز
                </span>
              </div>
            </div>

            {/* Notes: legacy free-text + saved quick notes + composer (B39) */}
            <div className="mt-3 space-y-2">
              {patient.notes && (
                <div>
                  <button
                    type="button"
                    onClick={() => setNoteExpanded(!noteExpanded)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-purple-500" />
                    <span>ملاحظات إضافية</span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-200 ${
                        noteExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {noteExpanded && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 rounded-xl bg-purple-50/60 p-3 text-xs text-purple-900 border border-purple-200/50 leading-relaxed"
                      >
                        {patient.notes}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {quickNotes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    ملاحظات الطبيب ({quickNotes.length})
                  </p>
                  {quickNotes.slice(0, noteExpanded ? quickNotes.length : 2).map((note, idx) => (
                    <div
                      key={`${note.date}-${idx}`}
                      className="rounded-xl border border-purple-200/50 bg-purple-50/60 p-2.5 text-xs text-purple-900"
                    >
                      <p className="leading-relaxed">{note.text}</p>
                      <p className="mt-1 text-[10px] text-purple-500">
                        📅 {formatDateAr(note.date)}
                        {note.date.length > 10 ? ` · 🕐 ${note.date.slice(11, 16)}` : ''}
                        {note.by ? ` · 👨‍⚕️ ${note.by}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence initial={false}>
                {composerOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 rounded-xl border border-purple-200/70 bg-white/70 p-3">
                      <textarea
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="اكتب ملاحظة سريعة عن المريض…"
                        aria-label="نص الملاحظة السريعة"
                        className="w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      {noteError && (
                        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
                          {noteError}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void submitQuickNote()}
                          disabled={noteSaving || !noteDraft.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {noteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {noteSaving ? 'جارٍ الحفظ…' : 'حفظ الملاحظة'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setComposerOpen(false);
                            setNoteError(null);
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Multi-state Quick Action Buttons */}
            <div className="mt-6 pt-5 border-t border-slate-200/70">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                إجراءات فورية سريعة
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <MultiStateActionButton
                  icon={Phone}
                  label="اتصال مباشر"
                  subLabel={patient.phone || 'غير متوفر'}
                  color="emerald"
                  badgeLetter="T"
                  href={patient.phone ? `tel:${patient.phone}` : undefined}
                />
                <MultiStateActionButton
                  icon={MessageCircle}
                  label="محادثة واتساب"
                  subLabel={whatsappTarget ? `+${whatsappTarget}` : 'رقم غير صالح'}
                  color="blue"
                  badgeLetter="W"
                  href={whatsappTarget ? `https://wa.me/${whatsappTarget}` : undefined}
                />
                <MultiStateActionButton
                  icon={FileText}
                  label="ملاحظة سريعة"
                  subLabel="تدوين فوري"
                  color="purple"
                  badgeLetter="N"
                  onClick={() => {
                    setComposerOpen((v) => !v);
                    setNoteError(null);
                  }}
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* ============================================================== */}
        {/* LEVEL 2: CASCADING STATS CARDS (10 SECONDS OVERVIEW)           */}
        {/* ============================================================== */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>🗂️ بطاقات النشاط المتتالية</span>
              <span className="text-[11px] font-normal text-slate-400">
                (نظرة سريعة في 10 ثوانٍ)
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Visits */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              whileHover={{ y: -4 }}
              onClick={onOpenVisits}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-blue-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  زيارات
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                  {stats.visitsCount}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">إجمالي الزيارات والمواعيد</p>
              </div>
            </motion.div>

            {/* Card 2: Medical Files */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.4 }}
              whileHover={{ y: -4 }}
              onClick={onOpenFiles}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <Files className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  ملفات
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 group-hover:text-emerald-600 transition-colors">
                  {stats.filesCount}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">وثائق وأشعة مرفوعة</p>
              </div>
            </motion.div>

            {/* Card 3: Referrals */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.4 }}
              whileHover={{ y: -4 }}
              onClick={onOpenReferrals}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-purple-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-purple-400 hover:shadow-xl hover:shadow-purple-500/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                  تحويلات
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 group-hover:text-purple-600 transition-colors">
                  {stats.referralsCount}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">مراكز أشعة ومعامل</p>
              </div>
            </motion.div>

            {/* Card 4: Invoices */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, duration: 0.4 }}
              whileHover={{ y: -4 }}
              onClick={onOpenInvoices}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-amber-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-amber-400 hover:shadow-xl hover:shadow-amber-500/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                  <Receipt className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  فواتير
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 group-hover:text-amber-600 transition-colors">
                  {stats.invoicesCount}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">فواتير ومطالبات مالية</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* LEVEL 3: INTERACTIVE VERTICAL TIMELINE (30 SECONDS DETAILS)    */}
        {/* ============================================================== */}
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-md sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                ⏳ الخط الزمني لرحلة المريض
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تتبع متكامل للمحطات: المنجزة، الجارية، والمتبقية
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200/60">
                <CheckCircle2 className="h-3 w-3" /> تم
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 border border-blue-200/60">
                <Clock className="h-3 w-3" /> قيد
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200/60">
                <Hourglass className="h-3 w-3" /> متبقي
              </span>
            </div>
          </div>

          <div className="relative mt-6 pr-4 sm:pr-6">
            {/* Vertical Spine Line */}
            <div className="absolute right-[22px] top-3 bottom-3 w-[2px] bg-gradient-to-b from-emerald-400 via-blue-400 to-amber-300" />

            {timeline.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                لا توجد أحداث مسجلة في الخط الزمني لهذا المريض بعد.
              </div>
            ) : (
              <div className="space-y-6">
                {timeline.map((item, idx) => {
                  // A quick note is not a workflow state — it gets its own node
                  // instead of inheriting the ✅ «تم بنجاح» appointment styling.
                  const noteConfig = {
                    badge: '📝 ملاحظة',
                    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
                    nodeBg: 'bg-purple-500 text-white ring-4 ring-purple-100',
                    icon: FileText,
                  };
                  const statusConfig =
                    (item.iconType === 'note'
                      ? noteConfig
                      : {
                    completed: {
                      badge: '✅ تم بنجاح',
                      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      nodeBg: 'bg-emerald-500 text-white ring-4 ring-emerald-100',
                      icon: CheckCircle2,
                    },
                    in_progress: {
                      badge: '⏳ قيد المتابعة',
                      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
                      nodeBg: 'bg-blue-500 text-white ring-4 ring-blue-100 animate-pulse',
                      icon: Clock,
                    },
                    remaining: {
                      badge: '⏳ متبقي ومجدول',
                      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
                      nodeBg: 'bg-amber-500 text-white ring-4 ring-amber-100',
                      icon: Hourglass,
                    },
                    cancelled: {
                      badge: '❌ ملغي',
                      badgeClass: 'bg-red-50 text-red-700 border-red-200',
                      nodeBg: 'bg-red-500 text-white ring-4 ring-red-100',
                      icon: AlertTriangle,
                    },
                  }[item.status] || {
                    badge: 'غير محدد',
                    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
                    nodeBg: 'bg-slate-400 text-white ring-4 ring-slate-100',
                    icon: Clock,
                  });

                  const NodeIcon = statusConfig.icon;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx, duration: 0.35 }}
                      onClick={() => onOpenTimelineDetail?.(item)}
                      className="group relative flex items-start gap-4 cursor-pointer"
                    >
                      <div
                        className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-transform duration-200 group-hover:scale-125 ${statusConfig.nodeBg}`}
                      >
                        <NodeIcon className="h-3.5 w-3.5" />
                      </div>

                      <div className="flex-1 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-blue-300 group-hover:shadow-md">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h3>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusConfig.badgeClass}`}
                          >
                            {statusConfig.badge}
                          </span>
                        </div>

                        {item.subtitle && (
                          <p className="mt-1 text-xs text-slate-600">{item.subtitle}</p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span>📅 {formatDateAr(item.date)}</span>
                          {item.time && <span>🕐 {formatTimeAr(item.time)}</span>}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
