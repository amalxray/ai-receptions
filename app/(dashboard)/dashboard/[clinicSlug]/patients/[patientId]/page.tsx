'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClinicContext } from '@/lib/useClinicContext';
import { supabase } from '@/lib/supabase';
import {
  COMMUNICATION_STATUS_AR,
  COMMUNICATION_CHANNEL_AR,
  COMMUNICATION_TYPE_AR,
  communicationTypeAr,
} from '@/lib/dashboard/labels-ar';
import PatientFinancialFilesPanel from '@/components/dashboard/patients/PatientFinancialFilesPanel';
import PatientMedicalFilesTab from '@/components/dashboard/patients/PatientMedicalFilesTab';
import TransferDialog from '@/components/dashboard/imaging/TransferDialog';
import {
  appendPatientSession,
  appendQuickNote,
  closePatientTreatment,
  getPatientOutstandingDebt,
  getPatientTreatmentStatus,
  parsePatientSessions,
  patientTreatmentStatusLabel,
  reopenPatientTreatment,
  resolvePatientAgeLabel,
  serializePatientMetadata,
  updatePatientSession,
  type PatientSession,
  type PatientSessionDraft,
  type PatientSessionStatus,
} from '@/components/dashboard/patients/smartProfile';
import PatientAppointmentsPanel, { type PatientAppointmentRow } from '@/components/dashboard/patients/PatientAppointmentsPanel';
import PatientSessionsPanel, { SessionsSkeleton } from '@/components/dashboard/patients/PatientSessionsPanel';
import PatientImagingRequestsPanel from '@/components/dashboard/patients/PatientImagingRequestsPanel';
import {
  belongsToPatient,
  filesTabKey,
  isImagingFile,
  patientFileTabs,
  resolvePatientFileTab,
  type ImagingRequestRow,
  type PatientFileTabKey,
} from '@/lib/services/imagingPatientFile';
import { imagingTypeLabel } from '@/lib/services/referralWorkflow';
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
 *
 * N30 — the tab set is ACTIVITY-AWARE (`patientFileTabs(activity_type)`): a
 * dental clinic keeps its treatment-session and file tabs exactly as before,
 * while an imaging center gets 🩹 طلبات الأشعة (the referral inbox for this
 * patient) and 🩻 الدراسات (the same files, read as radiology studies). Nothing
 * is migrated and no other domain changes: an unknown activity type (or a
 * transient unresolved one) falls back to the dental reading.
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

/**
 * N30 — the tab set is NOT a local constant anymore: it is derived per activity
 * by `patientFileTabs()` (lib/services/imagingPatientFile), which is also what
 * the tests pin. `TabKey` → `PatientFileTabKey`.
 */

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
  const { clinicId, authHeaders, role, activityType, loading: clinicLoading } = useClinicContext();

  /** N30 — activity-aware tabs + derived shortcuts (single source: the model). */
  const tabs = useMemo(() => patientFileTabs(activityType), [activityType]);
  const imagingMode = isImagingFile(activityType);
  const studiesTab = filesTabKey(activityType);

  const [tab, setTab] = useState<PatientFileTabKey>('overview');
  /**
   * `activity_type` resolves asynchronously, so a requested tab can briefly be
   * one this activity does not have (e.g. 'sessions' inside an imaging center).
   * Everything renders from the clamped value instead of a blank body.
   */
  const effectiveTab = resolvePatientFileTab(activityType, tab);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    email: '',
    date_of_birth: '',
    gender: '' as '' | 'male' | 'female' | 'mr' | 'mrs',
    notes: '',
  });
  const [savingPatient, setSavingPatient] = useState(false);
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [treatmentModal, setTreatmentModal] = useState<{
    mode: 'close' | 'reopen';
    blocked: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** B37 — bump to re-run the patient load from the error state. */
  const [reloadKey, setReloadKey] = useState(0);

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [communications, setCommunications] = useState<PatientCommunication[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);
  /** Counters powering the N14 smart-profile activity cards (best effort). */
  const [overviewCounts, setOverviewCounts] = useState<SmartPatientStats>({
    visitsCount: 0,
    filesCount: 0,
    referralsCount: 0,
    invoicesCount: 0,
  });
  /**
   * N30 — `imaging_request_id` → label, so a study card in the 🩻 tab can say
   * WHICH referral produced it. Loaded only while that tab is open (the 🩹 tab
   * loads its own full rows), so the two never fetch the same thing twice.
   */
  const [requestsById, setRequestsById] = useState<Record<string, { label: string; status: string }>>({});


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
    if (effectiveTab !== 'appointments' && effectiveTab !== 'overview') return;
    if (!clinicId || !patientId) return;
    void (async () => {
      setApptsLoading(true);
      setAppointmentsError(null);
      try {
        const headers = await authHeaders();
        /**
         * B48 — عُلّة «الموعد يُسجَّل ثم يختفي».
         *
         * GET /api/appointments answers `{ data: [...] }`, but this effect checked
         * `Array.isArray(body)` and therefore stored an EMPTY list on every load.
         * A created appointment only ever lived in local state (onCreated), so it
         * looked saved until the page was refreshed — while the row was safely in
         * the database the whole time. Read the envelope, and ask the API for this
         * patient only (the clinic-wide list is capped and ordered oldest-first).
         */
        const res = await fetch(
          `/api/appointments?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(patientId)}`,
          { headers }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || 'تعذر تحميل المواعيد');
        }
        const payload = await res.json().catch(() => null);
        const rows: PatientAppointment[] = Array.isArray(payload)
          ? (payload as PatientAppointment[])
          : Array.isArray(payload?.data)
            ? (payload.data as PatientAppointment[])
            : [];
        // Defensive: a deployment that ignores `patient_id` still cannot leak
        // another patient's appointment into this file.
        setAppointments(rows.filter((a) => a.patient_id === patientId));
      } catch (error) {
        setAppointments([]);
        setAppointmentsError(error instanceof Error ? error.message : 'تعذر تحميل المواعيد');
      } finally {
        setApptsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab, clinicId, patientId]);

  /**
   * N14 activity counters (files / invoices / referrals). Informational only:
   * any endpoint that is not reachable simply keeps its counter at 0 instead
   * of blocking the profile from rendering.
   */
  useEffect(() => {
    if (effectiveTab !== 'overview' || !clinicId || !patientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const q = `clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(patientId)}`;
        const [filesRes, invoicesRes, referralsRes] = await Promise.all([
          fetch(`/api/clinic/medical-files/list?${q}`, { headers }),
          fetch(`/api/clinic/accounting/invoices?${q}`, { headers }),
          // N30 — the same patient scope the 🩹 tab uses (direction=all keeps the
          // counter honest for both sides of a referral).
          fetch(`/api/imaging/referrals?${q}&direction=all`, { headers }),
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
          // N30 — for an imaging center the patient may be linked as
          // `patient_id_center` (its own file created from the referral), so the
          // counter must accept either link; clinics keep the exact old rule.
          referralsCount: referralsRes.ok
            ? rows(referralsJson).filter((r) =>
                imagingMode
                  ? belongsToPatient(
                      {
                        patient_id: (r.patient_id as string | null) ?? null,
                        patient_id_center: (r.patient_id_center as string | null) ?? null,
                      },
                      patientId
                    )
                  : r.patient_id === patientId
              ).length
            : 0,
        });
      } catch {
        /* counters stay at zero — the profile still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab, clinicId, patientId]);


  useEffect(() => {
    if (effectiveTab !== 'communications' || !clinicId || !patientId) return;
    void (async () => {
      setCommsLoading(true);
      setCommunicationsError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/patients/${patientId}/communications?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || 'تعذر تحميل سجل التواصل');
        }
        const json = await res.json();
        setCommunications((Array.isArray(json) ? json : json.data ?? []) as PatientCommunication[]);
      } catch (error) {
        setCommunications([]);
        setCommunicationsError(error instanceof Error ? error.message : 'تعذر تحميل سجل التواصل');
      } finally {
        setCommsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTab, clinicId, patientId]);

  /**
   * N30 — the requested tab may not exist for the resolved activity (see
   * `effectiveTab`): mirror the clamped value back into state so the nav
   * highlight matches what is actually rendered.
   */
  useEffect(() => {
    if (effectiveTab !== tab) setTab(effectiveTab);
  }, [effectiveTab, tab]);

  /**
   * N30 — the 🩻 الدراسات tab shows WHICH referral each study documents, so it
   * needs an id → label index of this patient's requests. It runs only while
   * that tab is open (the 🩹 tab loads the full rows itself), which keeps the
   * two tabs from ever fetching the same list in the same view.
   */
  useEffect(() => {
    if (!imagingMode || effectiveTab !== studiesTab || !clinicId || !patientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(patientId)}&direction=all`,
          { headers }
        );
        const json = await res.json().catch(() => null);
        const rows: ImagingRequestRow[] = res.ok && Array.isArray(json?.data) ? (json.data as ImagingRequestRow[]) : [];
        if (cancelled) return;
        setRequestsById(
          Object.fromEntries(
            rows
              .filter((row) => belongsToPatient(row, patientId))
              .map((row) => [
                row.id,
                { label: imagingTypeLabel(row.modality, row.requested_service), status: row.status },
              ])
          )
        );
      } catch {
        if (!cancelled) setRequestsById({});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagingMode, effectiveTab, studiesTab, clinicId, patientId]);

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

  /**
   * B23 — the appointment panel owns creation; the page merges the returned row
   * (typed back into `PatientAppointment`) so the timeline, the visits counter
   * and the overview refresh instantly.
   */
  const handleAppointmentCreated = useCallback(
    (created: PatientAppointmentRow) => {
      const row: PatientAppointment = {
        id: String(created.id),
        service: created.service ?? '',
        appointment_date: created.appointment_date,
        appointment_time: created.appointment_time ?? '',
        status: created.status,
        provider_name: created.provider_name ?? null,
        patient_id: patientId,
      };
      setAppointments((current) => [row, ...current.filter((item) => String(item.id) !== row.id)]);
    },
    [patientId]
  );

  const openPatientEdit = useCallback(() => {
    if (!patient) return;

    const metadata = (patient.metadata as Record<string, unknown> | undefined) ?? {};
    const nextGender =
      (typeof metadata.gender === 'string' && metadata.gender.trim()) ||
      (typeof (metadata.basic_info as Record<string, unknown> | undefined)?.gender === 'string'
        ? String((metadata.basic_info as Record<string, unknown>).gender)
        : '') ||
      '';

    setEditForm({
      name: patient.name ?? '',
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      date_of_birth: patient.metadata?.date_of_birth ?? '',
      gender: (nextGender === 'male' || nextGender === 'female' || nextGender === 'mr' || nextGender === 'mrs') ? nextGender : '',
      notes: patient.notes ?? '',
    });
    setShowEditModal(true);
  }, [patient]);

  const savePatientEdits = useCallback(async () => {
    if (!patient || !clinicId || !patientId) return;

    setSavingPatient(true);
    try {
      const headers = await authHeaders();
      const metadataPayload = {
        gender: editForm.gender || null,
        basic_info: {
          ...(typeof (patient.metadata as Record<string, unknown> | undefined)?.basic_info === 'object'
            ? ((patient.metadata as Record<string, unknown>).basic_info as Record<string, unknown>)
            : {}),
          gender: editForm.gender || null,
        },
      };

      const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          date_of_birth: editForm.date_of_birth || null,
          notes: editForm.notes.trim() || null,
          metadata: metadataPayload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'تعذر حفظ بيانات المريض');
      }

      const saved = (await res.json()) as Partial<PatientRecord>;
      const mergedMetadata = {
        ...(patient.metadata ?? {}),
        ...(saved.metadata ?? {}),
        gender: editForm.gender || null,
        basic_info: {
          ...((patient.metadata as Record<string, unknown> | undefined)?.basic_info as Record<string, unknown> | undefined ?? {}),
          ...(((saved.metadata as Record<string, unknown> | undefined)?.basic_info as Record<string, unknown> | undefined) ?? {}),
          gender: editForm.gender || null,
        },
        date_of_birth:
          saved.metadata?.date_of_birth ??
          patient.metadata?.date_of_birth ??
          (editForm.date_of_birth || null),
      };

      const nextPatient = {
        ...patient,
        ...saved,
        name: saved.name ?? patient.name,
        phone: saved.phone ?? patient.phone,
        email: saved.email ?? patient.email,
        notes: saved.notes ?? patient.notes,
        metadata: mergedMetadata,
      } as PatientRecord;

      setPatient(nextPatient);
      setShowEditModal(false);
      setTransferMsg('تم حفظ بيانات المريض بنجاح.');
    } catch (error) {
      console.error('Error updating patient', error);
      setTransferMsg(error instanceof Error ? error.message : 'تعذر حفظ تعديل المريض.');
    } finally {
      setSavingPatient(false);
    }
  }, [authHeaders, clinicId, editForm, patient, patientId]);

  /** N26 — the treatment plan lives in `metadata.sessions` (no migration). */
  const sessions = useMemo(() => parsePatientSessions(patient?.metadata), [patient?.metadata]);

  /**
   * N26 — one writer for the whole plan. Like the notes path, ONLY the `sessions`
   * key is sent: the PUT route shallow-merges `body.metadata` over the stored
   * JSONB, so a session can never clobber quick notes, medical history or the
   * manual age. Local state is updated from the same payload, so the progress bar
   * and the cards move without a refetch.
   */
  const persistSessions = useCallback(
    async (next: { sessions: PatientSession[] }, failureMessage: string) => {
      if (!clinicId || !patient) throw new Error('لم يتم تحديد المريض');
      const headers = await authHeaders();
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patient.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { sessions: next.sessions } }),
        }
      );
      if (!res.ok) {
        if (res.status === 401) throw new Error('انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة');
        if (res.status === 404) throw new Error('لم يُعثر على هذا المريض في هذه العيادة');
        throw new Error(failureMessage);
      }
      setPatient((prev) =>
        prev ? { ...prev, metadata: { ...(prev.metadata ?? {}), sessions: next.sessions } } : prev
      );
    },
    [authHeaders, clinicId, patient]
  );

  const addSession = useCallback(
    async (draft: PatientSessionDraft) => {
      if (!patient) throw new Error('لم يتم تحديد المريض');
      await persistSessions(appendPatientSession(patient.metadata, draft), 'تعذر حفظ الجلسة — حاول مرة أخرى');
    },
    [patient, persistSessions]
  );

  const changeSessionStatus = useCallback(
    async (session: PatientSession, status: PatientSessionStatus) => {
      if (!patient) throw new Error('لم يتم تحديد المريض');
      await persistSessions(
        updatePatientSession(patient.metadata, session.id, { status }),
        'تعذر تحديث الجلسة — حاول مرة أخرى'
      );
    },
    [patient, persistSessions]
  );

  const outstandingDebt = useMemo(
    () => (patient ? getPatientOutstandingDebt(patient.metadata) : 0),
    [patient?.metadata]
  );

  const persistPatientMetadata = useCallback(
    async (nextMetadata: Record<string, unknown>, failureMessage: string) => {
      if (!clinicId || !patient) throw new Error('لم يتم تحديد المريض');
      const headers = await authHeaders();
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patient.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: serializePatientMetadata(nextMetadata) }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || failureMessage);
      }
      const saved = (await res.json()) as Partial<PatientRecord>;
      setPatient((prev) =>
        prev
          ? {
              ...prev,
              ...saved,
              metadata: {
                ...(prev.metadata ?? {}),
                ...(saved.metadata ?? {}),
                ...serializePatientMetadata(nextMetadata),
              },
            }
          : prev
      );
    },
    [authHeaders, clinicId, patient]
  );

  const openTreatmentModal = useCallback(
    (mode: 'close' | 'reopen') => {
      if (!patient) return;
      const blocked = mode === 'close' && outstandingDebt > 0;
      setTreatmentModal({ mode, blocked });
    },
    [outstandingDebt, patient]
  );

  const confirmTreatmentAction = useCallback(async () => {
    if (!patient) return;
    if (treatmentModal?.mode === 'close' && outstandingDebt > 0) {
      setTreatmentModal({ mode: 'close', blocked: true });
      return;
    }

    try {
      const nextMetadata =
        treatmentModal?.mode === 'close'
          ? closePatientTreatment(patient.metadata, { reason: 'إغلاق العلاج' })
          : reopenPatientTreatment(patient.metadata, { note: 'إعادة فتح الحساب' });
      await persistPatientMetadata(nextMetadata, treatmentModal?.mode === 'close' ? 'تعذر إنهاء العلاج' : 'تعذر إعادة فتح الحساب');
      setTreatmentModal(null);
    } catch (error) {
      setTransferMsg(error instanceof Error ? error.message : 'تعذر تحديث حالة العلاج');
    }
  }, [outstandingDebt, patient, persistPatientMetadata, treatmentModal]);

  const past = useMemo(
    () => appointments.filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'),
    [appointments]
  );

  /** N14 smart profile: visits counter comes from appointments, the rest from `overviewCounts`. */
  const smartStats = useMemo<SmartPatientStats>(
    () => ({ ...overviewCounts, visitsCount: appointments.length }),
    [appointments, overviewCounts]
  );

  const treatmentStatus = useMemo(
    () => (patient ? getPatientTreatmentStatus(patient.metadata) : 'active'),
    [patient?.metadata]
  );
  const upcomingAppointmentsCount = useMemo(
    () => appointments.filter((item) => ['scheduled', 'confirmed', 'pending'].includes(item.status)).length,
    [appointments]
  );
  const profilePatient = useMemo(
    () => (patient ? { ...patient, status: patientTreatmentStatusLabel(patient.metadata) } : null),
    [patient]
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
          {patient && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                treatmentStatus === 'closed'
                  ? 'bg-slate-700/80 text-slate-200 ring-slate-600'
                  : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40'
              }`}
            >
              {treatmentStatus === 'closed' ? '⚫ منتهي' : '🟢 نشط'}
            </span>
          )}
          {patient && (
            <button
              type="button"
              onClick={() => (treatmentStatus === 'closed' ? openTreatmentModal('reopen') : openTreatmentModal('close'))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                treatmentStatus === 'closed'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
              }`}
            >
              {treatmentStatus === 'closed' ? '🔓 إعادة فتح حساب جديد' : '🛑 إنهاء العلاج'}
            </button>
          )}
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

      {/* N26 — a skeleton instead of a text loading line: the patient row carries
          `metadata.sessions`, so this is exactly what the page is waiting for. */}
      {loading && (
        <div className="space-y-3">
          <div className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="h-4 w-40 rounded-full bg-slate-800" />
            <div className="mt-3 h-3 w-64 rounded-full bg-slate-800/70" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="h-16 rounded-xl bg-slate-800/50" />
              <div className="h-16 rounded-xl bg-slate-800/50" />
              <div className="h-16 rounded-xl bg-slate-800/50" />
            </div>
          </div>
          <SessionsSkeleton variant="full" />
        </div>
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
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  effectiveTab === t.key ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-500/40' : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-[40vh]">
            {effectiveTab === 'overview' && (
              <div className="space-y-4">
                {/* N14 — Smart Patient Profile (3-level cognitive layout).
                    N27 — the profile merges `metadata.sessions` itself, so only the
                    click target needs routing: a 🦷 event opens the sessions tab.
                    N30 — an imaging center has no treatment sessions, so the same
                    click routes to its own referral tab instead, and the referral
                    counter opens the 🩹 list rather than a transfer dialog. */}
                <SmartPatientProfile
                  patient={profilePatient ?? patient}
                  stats={smartStats}
                  appointments={smartAppointments}
                  onOpenVisits={() => setTab('appointments')}
                  onOpenFiles={() => setTab(studiesTab)}
                  onOpenInvoices={() => setTab('financial')}
                  onOpenReferrals={() => (imagingMode ? setTab('requests') : setShowTransfer(true))}
                  onEditPatient={openPatientEdit}
                  onOpenTimelineDetail={(item) =>
                    setTab(
                      item.iconType === 'session' ? (imagingMode ? 'requests' : 'sessions') : 'appointments'
                    )
                  }
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
                    {appointmentsError ? (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={appointmentsError}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <span>⚠️</span>
                            <span>تعذّر تحميل المواعيد</span>
                          </div>
                          <p className="mt-2 text-rose-100/90">{appointmentsError}</p>
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <>
                        <PatientAppointmentsPanel
                          variant="compact"
                          clinicId={clinicId}
                          patientId={patientId}
                          patientName={patient.name}
                          appointments={appointments}
                          loading={apptsLoading}
                          authHeaders={authHeaders}
                          onCreated={handleAppointmentCreated}
                        />
                        <p className="mt-4 text-xs text-slate-500">
                          التفاصيل الكاملة في تبويب «📅 المواعيد» — {past.length} زيارة سابقة.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* N26 — خطة العلاج: شريط «ما تم / ما بقي» وأقرب الجلسات دون مغادرة النظرة العامة.
                    N30 — an imaging center has no treatment plan, so the same slot
                    carries its referral workload (🩹) with a one-click jump. */}
                {imagingMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div>
                      <p className="text-sm font-semibold text-white">🩹 طلبات الأشعة لهذا المريض</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {overviewCounts.referralsCount > 0
                          ? `${overviewCounts.referralsCount} طلب مرتبط بهذا الملف (واردة من عيادات محوِّلة أو صادرة).`
                          : 'لا توجد طلبات أشعة مرتبطة بهذا الملف حتى الآن.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('requests')}
                      className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      عرض الطلبات
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <PatientSessionsPanel
                      variant="compact"
                      clinicId={clinicId}
                      authHeaders={authHeaders}
                      sessions={sessions}
                      onAdd={addSession}
                      onStatusChange={changeSessionStatus}
                    />
                  </div>
                )}
              </div>
            )}


            {effectiveTab === 'appointments' && (
              <PatientAppointmentsPanel
                variant="full"
                clinicId={clinicId}
                patientId={patientId}
                patientName={patient.name}
                appointments={appointments}
                loading={apptsLoading}
                authHeaders={authHeaders}
                onCreated={handleAppointmentCreated}
              />
            )}

            {/* N30 — 🩹 طلبات الأشعة: imaging centers only (never rendered for a
                clinic, whose tab set has no 'requests' key at all). */}
            {effectiveTab === 'requests' && clinicId && (
              <PatientImagingRequestsPanel
                clinicId={clinicId}
                patientId={patient.id}
                clinicSlug={clinicSlug}
                authHeaders={authHeaders}
                onOpenStudies={() => setTab(studiesTab)}
                onCountChange={(count) =>
                  setOverviewCounts((prev) =>
                    prev.referralsCount === count ? prev : { ...prev, referralsCount: count }
                  )
                }
              />
            )}

            {/* Dental treatment plan (N26) — `effectiveTab` can never be
                'sessions' inside an imaging center (the tab does not exist). */}
            {effectiveTab === 'sessions' && !imagingMode && (
              <PatientSessionsPanel
                variant="full"
                clinicId={clinicId}
                authHeaders={authHeaders}
                sessions={sessions}
                onAdd={addSession}
                onStatusChange={changeSessionStatus}
              />
            )}

            {effectiveTab === 'financial' && (
              <PatientFinancialFilesPanel patientId={patient.id} patientName={patient.name} />
            )}

            {/* Medical imaging files: direct upload up to 2 GiB (X-ray / CBCT / DICOM).
                `files` (dental wording) and `studies` (radiology wording) are the
                SAME data and the SAME component — only the reading differs. */}
            {effectiveTab === 'files' && clinicId && (
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

            {effectiveTab === 'studies' && clinicId && (
              <PatientMedicalFilesTab
                variant="imaging"
                clinicId={clinicId}
                patientId={patient.id}
                authHeaders={authHeaders}
                requestsById={requestsById}
                onCountChange={(count) =>
                  setOverviewCounts((prev) =>
                    prev.filesCount === count ? prev : { ...prev, filesCount: count }
                  )
                }
              />
            )}

            {effectiveTab === 'communications' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                {commsLoading ? (
                  <p className="text-sm text-slate-400">جارٍ تحميل سجل التواصل...</p>
                ) : communicationsError ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={communicationsError}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <span>⚠️</span>
                        <span>تعذّر تحميل سجل التواصل</span>
                      </div>
                      <p className="mt-2 text-rose-100/90">{communicationsError}</p>
                    </motion.div>
                  </AnimatePresence>
                ) : communications.length === 0 ? (
                  <p className="text-sm text-slate-500">لا توجد عمليات تواصل بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {communications.map((comm) => (
                      <div key={comm.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-200">
                            {COMMUNICATION_TYPE_AR[comm.type] ?? communicationTypeAr(comm.type)}
                          </span>
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
              </motion.div>
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

      {showEditModal && patient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">تعديل بيانات المريض</h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                إغلاق
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm text-slate-300">
                الاسم
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </label>
              <label className="text-sm text-slate-300">
                الهاتف
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </label>
              <label className="text-sm text-slate-300">
                البريد الإلكتروني
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </label>
              <label className="text-sm text-slate-300">
                تاريخ الميلاد
                <input
                  type="date"
                  value={editForm.date_of_birth}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </label>
              <div className="sm:col-span-2 text-sm text-slate-300">
                <span className="mb-2 block text-sm text-slate-300">الجنس</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: 'male', label: 'ذكر', icon: '👨' },
                    { value: 'female', label: 'أنثى', icon: '👩' },
                    { value: 'mr', label: 'سيد', icon: '🧔' },
                    { value: 'mrs', label: 'سيدة', icon: '👩‍🦰' },
                  ].map((option) => {
                    const active = editForm.gender === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, gender: option.value as 'male' | 'female' | 'mr' | 'mrs' }))}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-right transition ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100 ring-2 ring-cyan-500/30'
                            : 'border-slate-700 bg-slate-950/70 text-slate-200 hover:border-slate-500 hover:bg-slate-800/80'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{option.icon}</span>
                          <span className="font-medium">{option.label}</span>
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            active ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-500 bg-transparent'
                          }`}
                        >
                          {active ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="sm:col-span-2 text-sm text-slate-300">
                ملاحظات
                <textarea
                  rows={4}
                  value={editForm.notes}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void savePatientEdits()}
                disabled={savingPatient}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPatient ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {treatmentModal && patient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-md rounded-[28px] border border-amber-500/30 bg-slate-900/95 p-5 text-slate-100 shadow-2xl shadow-amber-950/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">تأكيد</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  {treatmentModal.mode === 'close' ? 'إنهاء العلاج' : 'إعادة فتح الحساب'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTreatmentModal(null)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                إغلاق
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
              {treatmentModal.mode === 'close' ? (
                <>
                  <p className="font-semibold text-amber-200">⚠️ قبل إنهاء العلاج</p>
                  <ul className="space-y-2 text-amber-100/90">
                    <li>• فواتير غير مدفوعة: {outstandingDebt} شيكل</li>
                    <li>• مواعيد قادمة: {upcomingAppointmentsCount}</li>
                  </ul>
                </>
              ) : (
                <p className="font-medium text-emerald-100">سيتم إنشاء حساب جديد مع جلسة علاج جديدة.</p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTreatmentModal(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void confirmTreatmentAction()}
                disabled={treatmentModal.blocked}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-slate-950 ${
                  treatmentModal.mode === 'close'
                    ? 'bg-amber-400 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50'
                    : 'bg-emerald-400 hover:bg-emerald-300'
                }`}
              >
                {treatmentModal.mode === 'close' ? 'تأكيد الإغلاق' : 'تأكيد إعادة الفتح'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
