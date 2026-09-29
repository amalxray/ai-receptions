'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import PatientMedicalFilesTab from '@/components/dashboard/patients/PatientMedicalFilesTab';
import PatientSessionsPanel from '@/components/dashboard/patients/PatientSessionsPanel';
import Skeleton from '@/components/ui/Skeleton';
import {
  buildSessionTimelineItems,
  formatDateAr,
  formatManualAgeAr,
  parsePatientSessions,
  readManualAge,
  sessionProcedureTone,
  sessionProgress,
  sessionStatusAr,
  sortTimelineDesc,
  type PatientSession,
  type PatientSessionDraft,
  type PatientSessionStatus,
  type SmartTimelineItem,
} from '@/components/dashboard/patients/smartProfile';
import { patientStatusTone, type PatientSearchRecord } from '@/lib/services/patientSearch';
import { usePressRipple } from '@/components/dashboard/patients/PatientSearchBar';

/**
 * N28 — the patient panel that opens UNDER the search results: three buttons
 * (📋 معلومات · 💊 العلاج · 📁 ملفات) and a switcher that slides a shared
 * `layoutId` pill between them.
 *
 * The switcher is deliberately an inline segmented dock — `components/ui/dock.tsx`
 * is `fixed bottom-4 left-1/2` (a screen-level macOS dock), so embedding it here
 * would float it over the page. N29 gives Dock a `variant="inline"` and this
 * switcher can then be swapped for it.
 */

export type PatientPanelAppointment = {
  id: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  provider_name?: string | null;
};

const TABS = [
  { key: 'info', emoji: '📋', label: 'معلومات' },
  { key: 'treatment', emoji: '💊', label: 'العلاج' },
  { key: 'files', emoji: '📁', label: 'ملفات' },
] as const;

type PanelTabKey = (typeof TABS)[number]['key'];

type PatientPanelProps = {
  patient: PatientSearchRecord;
  clinicId: string | null;
  clinicSlug: string;
  authHeaders: () => Promise<Record<string, string>>;
  appointments: PatientPanelAppointment[];
  appointmentsLoading?: boolean;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
  /** N26 plan writers — the panel is read/write, exactly like the detail page. */
  onAddSession: (draft: PatientSessionDraft) => Promise<void>;
  onSessionStatusChange: (session: PatientSession, status: PatientSessionStatus) => Promise<void>;
};

export default function PatientPanel({
  patient,
  clinicId,
  clinicSlug,
  authHeaders,
  appointments,
  appointmentsLoading = false,
  onEdit,
  onClose,
  onDelete,
  onAddSession,
  onSessionStatusChange,
}: PatientPanelProps) {
  const [tab, setTab] = useState<PanelTabKey>('info');
  const [filesCount, setFilesCount] = useState<number | null>(null);
  const { spawn, layer } = usePressRipple();

  const tone = patientStatusTone(patient.status);
  const ageLabel = formatManualAgeAr(readManualAge(patient.metadata));

  /** N26 — the treatment plan lives in `metadata.sessions` (no migration). */
  const sessions = useMemo(() => parsePatientSessions(patient.metadata), [patient.metadata]);
  const progress = useMemo(() => sessionProgress(sessions), [sessions]);

  /** N27 — the same journey nodes the detail page draws, newest first. */
  const timeline = useMemo(
    () => sortTimelineDesc(buildSessionTimelineItems(sessions)).slice(0, 8),
    [sessions]
  );

  /** آخر زيارة = newest completed appointment or completed session. */
  const lastVisit = useMemo(() => {
    const dates = [
      ...appointments.filter((item) => item.status === 'completed').map((item) => item.appointment_date),
      ...sessions.filter((session) => session.status === 'done').map((session) => session.date),
    ].filter(Boolean);
    return dates.length > 0 ? dates.sort()[dates.length - 1] : null;
  }, [appointments, sessions]);

  const openAppointments = appointments.filter(
    (item) => item.status === 'scheduled' || item.status === 'confirmed' || item.status === 'pending'
  ).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/85 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur-xl md:p-6"
      aria-label={`ملف المريض ${patient.name}`}
    >
      {/* Status-coloured aurora behind the header. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br ${tone.wash} opacity-20 blur-3xl`}
      />

      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <motion.span
            aria-hidden
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 18 }}
            className={`grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${tone.wash} text-lg font-bold text-slate-950`}
          >
            {patient.name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part.charAt(0))
              .join('')}
          </motion.span>

          <div className="min-w-0">
            <h3 className="truncate text-2xl font-semibold text-white">{patient.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
              {patient.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-cyan-300" />
                  <span dir="ltr">{patient.phone}</span>
                </span>
              ) : null}
              {patient.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-cyan-300" />
                  <span dir="ltr">{patient.email}</span>
                </span>
              ) : null}
              {ageLabel !== 'غير محدد' ? <span className="text-slate-400">🎂 {ageLabel}</span> : null}
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${tone.chip}`}>
                {tone.emoji} {tone.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            onPointerDown={spawn}
            className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/60 hover:text-cyan-200"
          >
            {layer}
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق ملف المريض"
            onPointerDown={spawn}
            className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-slate-700 text-slate-400 transition hover:border-red-500/60 hover:text-red-300"
          >
            {layer}
            ✕
          </button>
        </div>
      </header>

      {/* Inline dock — the three buttons. */}
      <nav className="relative mt-6 flex justify-center" aria-label="أقسام ملف المريض">
        <div className="flex items-center gap-1 rounded-2xl border border-slate-800 bg-slate-950/80 p-1.5 shadow-inner shadow-slate-950/60 backdrop-blur-xl">
          {TABS.map((entry) => {
            const active = tab === entry.key;
            return (
              <motion.button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                onPointerDown={spawn}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                aria-current={active ? 'page' : undefined}
                className={`relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {layer}
                {active && (
                  <motion.span
                    layoutId="patient-panel-tab"
                    className="absolute inset-0 rounded-xl bg-gradient-to-l from-cyan-500/30 to-emerald-500/20 ring-1 ring-cyan-400/40"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <motion.span aria-hidden animate={{ scale: active ? 1.15 : 1 }}>
                    {entry.emoji}
                  </motion.span>
                  {entry.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </nav>

      <div className="relative mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === 'info' ? (
              <InfoTab
                patient={patient}
                lastVisit={lastVisit}
                appointmentsTotal={appointments.length}
                openAppointments={openAppointments}
                appointmentsLoading={appointmentsLoading}
                done={progress.done}
                remaining={progress.remaining}
                percent={progress.percent}
                filesCount={filesCount}
                clinicSlug={clinicSlug}
                onDelete={onDelete}
              />
            ) : null}
            {tab === 'treatment' ? (
              <TreatmentTab
                sessions={sessions}
                done={progress.done}
                remaining={progress.remaining}
                percent={progress.percent}
                label={progress.label}
                timeline={timeline}
                onAdd={onAddSession}
                onStatusChange={onSessionStatusChange}
              />
            ) : null}
            {tab === 'files' ? (
              <FilesTab
                clinicId={clinicId}
                patientId={patient.id}
                authHeaders={authHeaders}
                onCountChange={setFilesCount}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* 📋 معلومات                                                                  */
/* -------------------------------------------------------------------------- */

/** Address lives in two places depending on which form wrote the record. */
function readAddress(metadata: unknown): string {
  const record = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const basicInfo =
    record.basic_info && typeof record.basic_info === 'object'
      ? (record.basic_info as Record<string, unknown>)
      : {};
  const address = basicInfo.address ?? record.address;
  return typeof address === 'string' && address.trim().length > 0 ? address.trim() : '';
}

type InfoTabProps = {
  patient: PatientSearchRecord;
  lastVisit: string | null;
  appointmentsTotal: number;
  openAppointments: number;
  /** True while the page is still fetching this patient's appointments. */
  appointmentsLoading: boolean;
  done: number;
  remaining: number;
  percent: number;
  filesCount: number | null;
  clinicSlug: string;
  onDelete: () => void;
};

function InfoTab({
  patient,
  lastVisit,
  appointmentsTotal,
  openAppointments,
  appointmentsLoading,
  done,
  remaining,
  percent,
  filesCount,
  clinicSlug,
  onDelete,
}: InfoTabProps) {
  const ageLabel = formatManualAgeAr(readManualAge(patient.metadata));
  const address = readAddress(patient.metadata);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <InfoRow icon="👤" label="الاسم" value={patient.name} />
        <InfoRow icon="📞" label="الهاتف" value={patient.phone || 'غير مسجّل'} ltr={Boolean(patient.phone)} />
        <InfoRow icon="✉️" label="البريد" value={patient.email || 'غير مسجّل'} ltr={Boolean(patient.email)} />
        <InfoRow icon="🎂" label="العمر" value={ageLabel} />
        <InfoRow icon="📍" label="العنوان" value={address || 'غير مسجّل'} />
        <InfoRow icon="🌐" label="مصدر التسجيل" value={patient.source || 'غير محدّد'} />
      </div>

      {appointmentsLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <InfoRow icon="🗓️" label="تاريخ التسجيل" value={formatDateAr(patient.created_at)} />
          <InfoRow
            icon="🩺"
            label="آخر زيارة"
            value={lastVisit ? formatDateAr(lastVisit) : 'لا زيارات مكتملة بعد'}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile emoji="📅" label="المواعيد" value={appointmentsTotal} />
        <StatTile emoji="⏭️" label="قادمة" value={openAppointments} />
        <StatTile emoji="✅" label="جلسات مكتملة" value={done} />
        <StatTile emoji="⏳" label="جلسات متبقية" value={remaining} />
        <StatTile emoji="📁" label="الملفات" value={filesCount ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/dashboard/${clinicSlug}/patients/${patient.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/30"
        >
          ↔ فتح الملف الكامل بالتبويبات
        </Link>
        {patient.phone ? (
          <a
            href={`tel:${patient.phone}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-emerald-500/60 hover:text-emerald-200"
          >
            📞 اتصال
          </a>
        ) : null}
        <span className="rounded-full border border-slate-800 px-4 py-2 text-xs text-slate-400">
          إكمال الخطة: {percent}%
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="ms-auto inline-flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          حذف المريض
        </button>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  ltr = false,
}: {
  icon: string;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 transition-colors hover:border-slate-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-slate-100" dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 💊 العلاج                                                                   */
/* -------------------------------------------------------------------------- */

type TreatmentTabProps = {
  sessions: PatientSession[];
  done: number;
  remaining: number;
  percent: number;
  label: string;
  timeline: SmartTimelineItem[];
  onAdd: (draft: PatientSessionDraft) => Promise<void>;
  onStatusChange: (session: PatientSession, status: PatientSessionStatus) => Promise<void>;
};

function TreatmentTab({
  sessions,
  done,
  remaining,
  percent,
  label,
  timeline,
  onAdd,
  onStatusChange,
}: TreatmentTabProps) {
  const doneSessions = sessions.filter((session) => session.status === 'done');
  const plannedSessions = sessions.filter((session) => session.status === 'planned');

  return (
    <div className="space-y-5">
      {/* 📊 نسبة الإكمال */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-semibold text-white">📊 نسبة الإكمال</p>
          <p className="text-slate-300">{label}</p>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-cyan-400 shadow-[0_0_18px_-2px_rgba(34,211,238,0.7)]"
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {percent}% مكتمل · {remaining} جلسة متبقية · {done} منجزة
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SessionList
          title="✅ ما تم إنجازه"
          accent="border-emerald-500/40 bg-emerald-500/[0.06]"
          chip="bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
          rows={doneSessions}
          empty="لم تُسجَّل جلسات مكتملة بعد."
        />
        <SessionList
          title="⏳ ما تبقى"
          accent="border-amber-500/40 bg-amber-500/[0.06]"
          chip="bg-amber-500/15 text-amber-200 ring-amber-500/30"
          rows={plannedSessions}
          empty="لا جلسات مخطّطة — الخطة مكتملة أو لم تُكتب بعد."
        />
      </div>

      {/* 📅 الخط الزمني (N27) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarDays className="h-4 w-4 text-cyan-300" />
          الخط الزمني للعلاج
        </p>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">لا أحداث علاج بعد — أضف جلسة لتظهر هنا.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {timeline.map((item, index) => {
              const tone = sessionProcedureTone(item.procedure);
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  className="relative pe-4 ps-1"
                >
                  <span aria-hidden className={`absolute inset-y-0 right-0 w-0.5 rounded-full ${tone.bar}`} />
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                    <span aria-hidden>{tone.emoji}</span>
                    {item.title}
                    {item.sessionStatus ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone.chip}`}>
                        {sessionStatusAr(item.sessionStatus)}
                      </span>
                    ) : null}
                  </p>
                  {item.subtitle ? <p className="mt-1 text-xs text-slate-400">{item.subtitle}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateAr(item.date)}</p>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>

      {/* N26 writers — the same panel the detail page uses. */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <PatientSessionsPanel
          sessions={sessions}
          variant="compact"
          onAdd={onAdd}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}

function SessionList({
  title,
  accent,
  chip,
  rows,
  empty,
}: {
  title: string;
  accent: string;
  chip: string;
  rows: PatientSession[];
  empty: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <p className="text-sm font-semibold text-white">
        {title} <span className="text-xs font-normal text-slate-400">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/70 px-3 py-2 text-xs"
            >
              <span className="font-semibold text-slate-100">{session.service}</span>
              <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${chip}`}>
                {session.tooth ? `🦷 ${session.tooth}` : formatDateAr(session.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact KPI used by 📋 معلومات — plain number, no animation dependency. */
function StatTile({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/80 px-3 py-3 text-center"
    >
      <p className="text-xs text-slate-400">
        <span aria-hidden>{emoji}</span> {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">{value.toLocaleString('en-US')}</p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* 📁 ملفات                                                                    */
/* -------------------------------------------------------------------------- */

type FilesTabProps = {
  clinicId: string | null;
  patientId: string;
  authHeaders: () => Promise<Record<string, string>>;
  onCountChange: (count: number) => void;
};

function FilesTab({ clinicId, patientId, authHeaders, onCountChange }: FilesTabProps) {
  // The clinic context resolves asynchronously; a skeleton beats a flash of text.
  if (!clinicId) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {/* Visual anchors for the four things this tab holds — the panel below owns
          the actual categories, drag & drop and upload. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs">
        <span className="font-semibold text-white">ملفات المريض:</span>
        <span className="rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-200">🖼️ بانوراما</span>
        <span className="rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-200">🩻 CBCT</span>
        <span className="rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-200">📄 تقارير</span>
        <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 font-semibold text-cyan-200 ring-1 ring-cyan-500/30">
          ➕ رفع ملف
        </span>
        <span className="ms-auto text-slate-500">التصنيف والسحب والإفلات داخل اللوحة</span>
      </div>

      <PatientMedicalFilesTab
        clinicId={clinicId}
        patientId={patientId}
        authHeaders={authHeaders}
        onCountChange={onCountChange}
      />
    </div>
  );
}