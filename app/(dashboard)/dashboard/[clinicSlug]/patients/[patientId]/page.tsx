'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClinicContext } from '@/lib/useClinicContext';
import { supabase } from '@/lib/supabase';
import { appointmentStatusAr, formatTimeAr, COMMUNICATION_STATUS_AR, COMMUNICATION_CHANNEL_AR } from '@/lib/dashboard/labels-ar';
import PatientFinancialFilesPanel from '@/components/dashboard/patients/PatientFinancialFilesPanel';
import PatientMedicalFilesTab from '@/components/dashboard/patients/PatientMedicalFilesTab';
import TransferDialog from '@/components/dashboard/imaging/TransferDialog';
import { appendQuickNote, resolvePatientAgeLabel } from '@/components/dashboard/patients/smartProfile';
import SmartPatientProfile, {
  type SmartPatientData,
  type SmartPatientStats,
  type SmartAppointment,
} from '@/components/dashboard/patients/SmartPatientProfile';

/**
 * PATIENT DETAIL — full standalone page (/dashboard/{slug}/patients/{id}).
 * Replaces the cramped stacked layout inside the patients list: tabs give
 * each domain (overview / appointments / financial / medical files /
 * communications)
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
  { key: 'financial', label: '💰 المالية' },
  { key: 'files', label: '🖼️ ملفات الأشعة' },
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
  const { clinicId, authHeaders, role, loading: clinicLoading } = useClinicContext();

  const [tab, setTab] = useState<TabKey>('overview');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** B37 — bump to re-run the patient load from the error state. */
  const [reloadKey, setReloadKey] = useState(0);

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
        // B37: read this patient directly instead of fetching the patients list
        // and `.find()`-ing it. That list route returns the NEWEST 50 patients
        // only, so every older patient looked deleted ("المريض غير موجود في هذه
        // العيادة") even though the row was intact.
        const res = await fetch(
          `/api/patients/${encodeURIComponent(patientId)}?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers }
        );
        if (res.status === 401) throw new Error('انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة');
        if (res.status === 403) throw new Error('لا تملك صلاحية الوصول إلى هذا المريض');
        if (res.status === 404) throw new Error('لم يُعثر على هذا المريض في هذه العيادة');
        if (!res.ok) throw new Error('تعذر تحميل بيانات المريض');
        const found = (await res.json()) as PatientRecord;
        if (!found || typeof found !== 'object' || !found.id) throw new Error('بيانات المريض غير متاحة');
        setPatient(found);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'حدث خطأ');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, patientId, clinicLoading, reloadKey]);

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

  /**
   * B39 — "ملاحظة سريعة" only toggled a collapsed block, so nothing was ever
   * stored (and for a patient with no notes the click did nothing at all).
   * Notes are appended to `patients.metadata.quick_notes` through
   * appendQuickNote, and only that key is sent: the PUT route shallow-merges
   * `body.metadata` over the existing JSONB, so source / status / medical
   * history / manual age can never be clobbered by a note. Local state is
   * updated from the same payload — the notes list and the smart timeline
   * re-render without a refetch.
   */
  const saveQuickNote = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!clinicId || !patient || !trimmed) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const author = sessionData.session?.user?.email ?? role ?? undefined;

      const next = appendQuickNote(patient.metadata, {
        text: trimmed,
        date: new Date().toISOString(),
        ...(author ? { by: author } : {}),
      });

      const headers = await authHeaders();
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patient.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { quick_notes: next.quick_notes } }),
        }
      );

      if (!res.ok) {
        if (res.status === 401) throw new Error('انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة');
        if (res.status === 404) throw new Error('لم يُعثر على هذا المريض في هذه العيادة');
        throw new Error('تعذر حفظ الملاحظة — حاول مرة أخرى');
      }

      setPatient((prev) =>
        prev ? { ...prev, metadata: { ...(prev.metadata ?? {}), quick_notes: next.quick_notes } } : prev
      );
    },
    [authHeaders, clinicId, patient, role]
  );

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
          className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-500/50 hover:text-white"
        >
          ← العودة للمرضى
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {patient && <h1 className="text-lg font-bold text-white">👤 {patient.name}</h1>}
          {patient && clinicId && !clinicLoading && (
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
            >
              🩻 تحويل لمركز تصوير
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">جارٍ التحميل...</div>
      )}
      {!loading && error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
          >
            🔄 إعادة المحاولة
          </button>
        </div>
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
              <div className="space-y-4">
                {/* N14 — Smart Patient Profile (3-level cognitive layout). */}
                <SmartPatientProfile
                  patient={patient}
                  stats={smartStats}
                  appointments={smartAppointments}
                  onOpenVisits={() => setTab('appointments')}
                  onOpenFiles={() => setTab('files')}
                  onOpenInvoices={() => setTab('financial')}
                  onOpenReferrals={() => setShowTransfer(true)}
                  onOpenTimelineDetail={() => setTab('appointments')}
                  onSaveQuickNote={saveQuickNote}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <p className="text-sm font-semibold text-white">تفاصيل التواصل</p>
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="text-slate-500">الهاتف</dt>
                      <dd className="text-slate-200" dir="ltr">{patient.phone || '—'}</dd>
                      <dt className="text-slate-500">البريد</dt>
                      <dd className="text-slate-200" dir="ltr">{patient.email || '—'}</dd>
                      <dt className="text-slate-500">العمر</dt>
                      <dd className="text-slate-200">{resolvePatientAgeLabel(patient.metadata)}</dd>
                    </dl>
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

            {/* Medical imaging files: direct upload up to 2 GiB (X-ray / CBCT / DICOM). */}
            {tab === 'files' && clinicId && (
              <PatientMedicalFilesTab
                clinicId={clinicId}
                patientId={patient.id}
                authHeaders={authHeaders}
                onCountChange={(count) =>
                  setOverviewCounts((prev) =>
                    prev.filesCount === count ? prev : { ...prev, filesCount: count }
                  )
                }
              />
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

      {transferMsg && (
        <div
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"
          role="status"
        >
          {transferMsg}
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
