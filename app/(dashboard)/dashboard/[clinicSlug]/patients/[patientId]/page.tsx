'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClinicContext } from '@/lib/useClinicContext';
import { appointmentStatusAr, formatTimeAr, COMMUNICATION_STATUS_AR, COMMUNICATION_CHANNEL_AR } from '@/lib/dashboard/labels-ar';
import PatientFinancialFilesPanel from '@/components/dashboard/patients/PatientFinancialFilesPanel';
import TransferDialog from '@/components/dashboard/imaging/TransferDialog';
import SmartPatientProfile, {
  type SmartPatientData,
  type SmartPatientStats,
  type SmartAppointment,
} from '@/components/dashboard/patients/SmartPatientProfile';

/**
 * PATIENT DETAIL — full standalone page (/dashboard/{slug}/patients/{id}).
 * Replaces the cramped stacked layout inside the patients list: tabs give
 * each domain (overview / appointments / financial+files / communications)
 * real width, the shell is responsive, and each tab fetches its own data
 * lazily. All data comes from membership-guarded APIs.
 */

type PatientRecord = SmartPatientData;

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

/**
 * N15 design tokens — every surface on this page reuses the exact language of
 * the smart profile card so the file reads as ONE screen, not four widgets.
 */
const CARD =
  'rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-md sm:p-6';
const SUBCARD = 'rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm';
const CARD_TITLE = 'flex items-center gap-2 text-sm font-bold text-slate-800';
const CARD_HINT = 'text-[11px] font-normal text-slate-400';
const INPUT_LABEL = 'text-xs font-semibold text-slate-500';
const INPUT_VALUE = 'text-sm font-medium text-slate-800';

function statusPill(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    scheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    cancelled: 'bg-red-50 text-red-700 border border-red-200',
    no_show: 'bg-amber-50 text-amber-700 border border-amber-200',
    sent: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    failed: 'bg-red-50 text-red-700 border border-red-200',
    retried: 'bg-amber-50 text-amber-700 border border-amber-200',
  };
  return map[status] ?? 'bg-slate-50 text-slate-600 border border-slate-200';
}



export default function PatientDetailPage() {
  const { patientId, clinicSlug } = useParams<{ patientId: string; clinicSlug: string }>();
  const { clinicId, authHeaders, loading: clinicLoading } = useClinicContext();

  const [tab, setTab] = useState<TabKey>('overview');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [communications, setCommunications] = useState<PatientCommunication[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  /** Counters powering the N14 smart-profile activity cards (best effort). */
  const [overviewCounts, setOverviewCounts] = useState<SmartPatientStats>({
    visitsCount: 0,
    filesCount: 0,
    referralsCount: 0,
    invoicesCount: 0,
  });


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
    // The smart profile (overview) renders the appointment timeline, so the
    // same lazy fetch serves both tabs.
    if (tab !== 'appointments' && tab !== 'overview') return;
    if (!clinicId || !patientId) return;
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

  /**
   * N14 activity counters (files / invoices / referrals). Informational only:
   * any endpoint that is not reachable simply keeps its counter at 0 instead
   * of blocking the profile from rendering.
   */
  useEffect(() => {
    if (tab !== 'overview' || !clinicId || !patientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const q = `clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(patientId)}`;
        const [filesRes, invoicesRes, referralsRes] = await Promise.all([
          fetch(`/api/clinic/medical-files/list?${q}`, { headers }),
          fetch(`/api/clinic/accounting/invoices?${q}`, { headers }),
          fetch(`/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&direction=all`, { headers }),
        ]);
        const [filesJson, invoicesJson, referralsJson] = await Promise.all([
          filesRes.json().catch(() => null),
          invoicesRes.json().catch(() => null),
          referralsRes.json().catch(() => null),
        ]);
        if (cancelled) return;
        const rows = (payload: unknown): Record<string, unknown>[] => {
          const data = (payload as { data?: unknown } | null)?.data;
          return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        };
        setOverviewCounts({
          visitsCount: 0,
          filesCount: filesRes.ok ? rows(filesJson).length : 0,
          invoicesCount: invoicesRes.ok ? rows(invoicesJson).length : 0,
          referralsCount: referralsRes.ok ? rows(referralsJson).filter((r) => r.patient_id === patientId).length : 0,
        });
      } catch {
        /* counters stay at zero — the profile still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
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

  /** N14 smart profile: visits counter comes from appointments, the rest from `overviewCounts`. */
  const smartStats = useMemo<SmartPatientStats>(
    () => ({ ...overviewCounts, visitsCount: appointments.length }),
    [appointments, overviewCounts]
  );

  const smartAppointments = useMemo<SmartAppointment[]>(
    () =>
      [...appointments]
        .sort((a, b) => (b.appointment_date + (b.appointment_time ?? '')).localeCompare(a.appointment_date + (a.appointment_time ?? '')))
        .map((a) => ({
          id: a.id,
          service: a.service,
          appointment_date: a.appointment_date,
          appointment_time: a.appointment_time ?? null,
          status: a.status,
          provider_name: a.provider_name ?? null,
        })),
    [appointments]
  );


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/dashboard/${clinicSlug}/patients`}
          className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-blue-400 hover:text-blue-600 hover:shadow-md"
        >
          ← العودة للمرضى
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {patient && <h1 className="text-lg font-extrabold tracking-tight text-slate-900">👤 {patient.name}</h1>}
          {patient && clinicId && !clinicLoading && (
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur-sm transition hover:bg-blue-100 hover:shadow-md"
            >
              🩻 تحويل لمركز تصوير
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className={`${SUBCARD} text-sm text-slate-500`}>جارٍ التحميل...</div>
      )}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>
      )}

      {!loading && !error && patient && (
        <>
          <nav
            aria-label="أقسام ملف المريض"
            className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-sm backdrop-blur-md"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  tab === t.key
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-[40vh]">
            {tab === 'overview' && (
              <div className="space-y-4">
                {/* N14 — Smart Patient Profile (3-level cognitive layout). */}
                <SmartPatientProfile
                  patient={patient}
                  stats={smartStats}
                  appointments={smartAppointments}
                  onOpenVisits={() => setTab('appointments')}
                  onOpenFiles={() => setTab('financial')}
                  onOpenInvoices={() => setTab('financial')}
                  onOpenReferrals={() => setShowTransfer(true)}
                  onOpenTimelineDetail={() => setTab('appointments')}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={SUBCARD}>
                    <h2 className={CARD_TITLE}>
                      <span>📇 تفاصيل التواصل</span>
                    </h2>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className={INPUT_LABEL}>الهاتف</dt>
                      <dd className={INPUT_VALUE} dir="ltr">{patient.phone || '—'}</dd>
                      <dt className={INPUT_LABEL}>البريد</dt>
                      <dd className={INPUT_VALUE} dir="ltr">{patient.email || '—'}</dd>
                      <dt className={INPUT_LABEL}>تاريخ الميلاد</dt>
                      <dd className={INPUT_VALUE} dir="ltr">{patient.metadata?.date_of_birth || 'غير مسجّل'}</dd>
                    </dl>
                  </div>
                  <div className={SUBCARD}>
                    <h2 className={CARD_TITLE}>
                      <span>📅 المواعيد القادمة</span>
                    </h2>
                    {upcoming.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">لا مواعيد قادمة.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {upcoming.slice(0, 5).map((a) => (
                          <li key={a.id} className="rounded-xl border border-blue-200/60 bg-blue-50/60 p-3 text-sm text-slate-700">
                            <p>🦷 {a.service || 'خدمة'} · {appointmentStatusAr(a.status)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              📅 {formatDateAr(a.appointment_date)} · 🕐 {formatTimeAr(a.appointment_time ?? '')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-5 text-sm font-bold text-slate-800">الزيارات السابقة ({past.length})</p>
                    <p className={`mt-1 ${CARD_HINT}`}>التفاصيل الكاملة في تبويب «📅 المواعيد».</p>
                  </div>
                </div>
              </div>
            )}


            {tab === 'appointments' && (
              <section className={CARD}>
                <h2 className={CARD_TITLE}>
                  <span>📅 المواعيد</span>
                  <span className={CARD_HINT}>({appointments.length})</span>
                </h2>
                {apptsLoading ? (
                  <p className="mt-3 text-sm text-slate-500">جارٍ تحميل المواعيد...</p>
                ) : appointments.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">لا توجد مواعيد لهذا المريض.</p>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {appointments.map((appt) => (
                      <div key={appt.id} className={`${SUBCARD} transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">🦷 {appt.service ?? 'خدمة غير محددة'}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPill(appt.status)}`}>
                            {appointmentStatusAr(appt.status)}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                          <p>📅 {formatDateAr(appt.appointment_date)}</p>
                          <p>🕐 {formatTimeAr(appt.appointment_time ?? '')}</p>
                          {appt.provider_name ? <p>👨‍⚕️ {appt.provider_name}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === 'financial' && (
              <PatientFinancialFilesPanel patientId={patient.id} patientName={patient.name} />
            )}

            {tab === 'communications' && (
              <div className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={CARD_TITLE}>
                    <span>📨 سجل التواصل</span>
                    <span className={CARD_HINT}>({communications.length} عملية)</span>
                  </h2>
                </div>
                {commsLoading ? (
                  <p className="mt-4 text-sm text-slate-400">جارٍ تحميل سجل التواصل...</p>
                ) : communications.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-500">
                    لا توجد عمليات تواصل بعد.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {communications.map((comm) => (
                      <div key={comm.id} className={SUBCARD}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">📤 {comm.type}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusPill(comm.status)}`}>
                            {COMMUNICATION_STATUS_AR[comm.status] ?? comm.status}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span>{COMMUNICATION_CHANNEL_AR[comm.channel] ?? comm.channel}</span>
                          {comm.sent_at ? <span>🕐 أُرسلت: {comm.sent_at.slice(0, 16).replace('T', ' ')}</span> : null}
                          {comm.attempt_count > 0 ? <span>🔁 محاولات: {comm.attempt_count}</span> : null}
                        </div>
                        {comm.last_error && (
                          <div className="mt-2 rounded-xl border border-red-200/70 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                            خطأ: {comm.last_error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {transferMsg && (
        <div
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 text-sm font-semibold text-emerald-800 shadow-sm backdrop-blur-sm"
          role="status"
        >
          ✅ {transferMsg}
        </div>
      )}

      {showTransfer && patient && clinicId && !clinicLoading && (
        <TransferDialog
          clinicId={clinicId}
          authHeaders={authHeaders}
          target={{ patientId: patient.id, patientName: patient.name }}
          onClose={() => setShowTransfer(false)}
          onDone={(r) => setTransferMsg(r.ok ? r.message : null)}
        />
      )}
    </div>
  );
}
