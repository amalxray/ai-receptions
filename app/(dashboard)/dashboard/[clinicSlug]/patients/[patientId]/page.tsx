'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClinicContext } from '@/lib/useClinicContext';
import { appointmentStatusAr, formatTimeAr, COMMUNICATION_STATUS_AR, COMMUNICATION_CHANNEL_AR } from '@/lib/dashboard/labels-ar';
import PatientFinancialFilesPanel from '@/components/dashboard/patients/PatientFinancialFilesPanel';

/**
 * PATIENT DETAIL — full standalone page (/dashboard/{slug}/patients/{id}).
 * Replaces the cramped stacked layout inside the patients list: tabs give
 * each domain (overview / appointments / financial+files / communications)
 * real width, the shell is responsive, and each tab fetches its own data
 * lazily. All data comes from membership-guarded APIs.
 */

type PatientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status?: string;
  notes?: string | null;
  created_at?: string;
};

type PatientAppointment = {
  id: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  provider_name?: string | null;
  patient_id: string;
};

type PatientCommunication = {
  id: string;
  type: string;
  channel: string;
  status: string;
  sent_at: string | null;
  attempt_count: number;
  last_error: string | null;
};

const TABS = [
  { key: 'overview', label: '📋 نظرة عامة' },
  { key: 'appointments', label: '📅 المواعيد' },
  { key: 'financial', label: '💰 المالية والملفات' },
  { key: 'communications', label: '🗨️ التواصل' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function formatDateAr(iso: string | null): string {
  if (!iso) return 'بدون تاريخ';
  try {
    return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function statusPill(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'bg-emerald-500/15 text-emerald-300',
    scheduled: 'bg-cyan-500/15 text-cyan-300',
    completed: 'bg-cyan-500/15 text-cyan-300',
    cancelled: 'bg-red-500/15 text-red-300',
    no_show: 'bg-amber-500/15 text-amber-300',
    sent: 'bg-emerald-500/15 text-emerald-300',
    failed: 'bg-red-500/15 text-red-300',
    retried: 'bg-amber-500/15 text-amber-300',
  };
  return map[status] ?? 'bg-slate-800 text-slate-400';
}

export default function PatientDetailPage() {
  const { patientId, clinicSlug } = useParams<{ patientId: string; clinicSlug: string }>();
  const { clinicId, authHeaders, loading: clinicLoading } = useClinicContext();

  const [tab, setTab] = useState<TabKey>('overview');
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [communications, setCommunications] = useState<PatientCommunication[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  useEffect(() => {
    if (clinicLoading) return;
    if (!clinicId || !patientId) {
      setError(clinicId ? 'المريض غير موجود' : 'لم يتم تحديد العيادة');
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/patients?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) throw new Error('بيانات المريض غير متاحة');
        const data = (await res.json()) as PatientRecord[];
        const list = Array.isArray(data) ? data : [];
        const found = list.find((p) => p.id === patientId) ?? null;
        if (!found) throw new Error('المريض غير موجود في هذه العيادة');
        setPatient(found);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, patientId, clinicLoading]);

  useEffect(() => {
    if (tab !== 'appointments' || !clinicId || !patientId) return;
    void (async () => {
      setApptsLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/appointments?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) throw new Error('تعذر تحميل المواعيد');
        const all = (await res.json()) as PatientAppointment[];
        setAppointments((Array.isArray(all) ? all : []).filter((a) => a.patient_id === patientId));
      } catch {
        setAppointments([]);
      } finally {
        setApptsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clinicId, patientId]);

  useEffect(() => {
    if (tab !== 'communications' || !clinicId || !patientId) return;
    void (async () => {
      setCommsLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/patients/${patientId}/communications?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) throw new Error('تعذر تحميل سجل التواصل');
        const json = await res.json();
        setCommunications((Array.isArray(json) ? json : json.data ?? []) as PatientCommunication[]);
      } catch {
        setCommunications([]);
      } finally {
        setCommsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clinicId, patientId]);

  const upcoming = useMemo(
    () =>
      [...appointments]
        .filter((a) => a.status === 'confirmed' || a.status === 'scheduled')
        .sort((a, b) => (a.appointment_date + (a.appointment_time ?? '')).localeCompare(b.appointment_date + (b.appointment_time ?? ''))),
    [appointments]
  );
  const past = useMemo(
    () => appointments.filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'),
    [appointments]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/${clinicSlug}/patients`}
          className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-500/50 hover:text-white"
        >
          ← العودة للمرضى
        </Link>
        {patient && <h1 className="text-lg font-bold text-white">👤 {patient.name}</h1>}
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">جارٍ التحميل...</div>
      )}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      )}

      {!loading && !error && patient && (
        <>
          <nav
            aria-label="أقسام ملف المريض"
            className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-1.5"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === t.key ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-500/40' : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-[40vh]">
            {tab === 'overview' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <p className="text-sm font-semibold text-white">معلومات المريض</p>
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-slate-500">الاسم</dt>
                    <dd className="text-slate-200">{patient.name}</dd>
                    <dt className="text-slate-500">الهاتف</dt>
                    <dd className="text-slate-200" dir="ltr">{patient.phone || '—'}</dd>
                    <dt className="text-slate-500">البريد</dt>
                    <dd className="text-slate-200" dir="ltr">{patient.email || '—'}</dd>
                    <dt className="text-slate-500">المصدر</dt>
                    <dd className="text-slate-200">{patient.source || '—'}</dd>
                    <dt className="text-slate-500">الحالة</dt>
                    <dd className="text-slate-200">{patient.status || '—'}</dd>
                    {patient.created_at && (
                      <>
                        <dt className="text-slate-500">سُجّل في</dt>
                        <dd className="text-slate-200">{formatDateAr(patient.created_at)}</dd>
                      </>
                    )}
                  </dl>
                  {patient.notes && (
                    <p className="mt-4 rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300">📝 {patient.notes}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <p className="text-sm font-semibold text-white">المواعيد القادمة</p>
                  {upcoming.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">لا مواعيد قادمة.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {upcoming.slice(0, 5).map((a) => (
                        <li key={a.id} className="rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300">
                          <p>🦷 {a.service || 'خدمة'} · {appointmentStatusAr(a.status)}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            📅 {formatDateAr(a.appointment_date)} · 🕐 {formatTimeAr(a.appointment_time ?? '')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-5 text-sm font-semibold text-white">الزيارات السابقة ({past.length})</p>
                  <p className="mt-1 text-xs text-slate-500">التفاصيل الكاملة في تبويب «📅 المواعيد».</p>
                </div>
              </div>
            )}

            {tab === 'appointments' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                {apptsLoading ? (
                  <p className="text-sm text-slate-400">جارٍ تحميل المواعيد...</p>
                ) : appointments.length === 0 ? (
                  <p className="text-sm text-slate-500">لا توجد مواعيد لهذا المريض.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {appointments.map((appt) => (
                      <div key={appt.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-100">🦷 {appt.service ?? 'خدمة غير محددة'}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPill(appt.status)}`}>
                            {appointmentStatusAr(appt.status)}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-slate-300">
                          <p>📅 {formatDateAr(appt.appointment_date)}</p>
                          <p>🕐 {formatTimeAr(appt.appointment_time ?? '')}</p>
                          {appt.provider_name ? <p>👨‍⚕️ {appt.provider_name}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'financial' && (
              <PatientFinancialFilesPanel patientId={patient.id} patientName={patient.name} />
            )}

            {tab === 'communications' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                {commsLoading ? (
                  <p className="text-sm text-slate-400">جارٍ تحميل سجل التواصل...</p>
                ) : communications.length === 0 ? (
                  <p className="text-sm text-slate-500">لا توجد عمليات تواصل بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {communications.map((comm) => (
                      <div key={comm.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-200">{comm.type}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill(comm.status)}`}>
                            {COMMUNICATION_STATUS_AR[comm.status] ?? comm.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          <span>{COMMUNICATION_CHANNEL_AR[comm.channel] ?? comm.channel}</span>
                          {comm.sent_at ? ` • أُرسلت: ${comm.sent_at.slice(0, 16).replace('T', ' ')}` : ''}
                          {comm.attempt_count > 0 ? ` • محاولات: ${comm.attempt_count}` : ''}
                        </div>
                        {comm.last_error && <div className="mt-1 text-xs text-red-400">خطأ: {comm.last_error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
