'use client';

import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { AlertCircle, FileText, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Magnetic } from '@/components/ui/magnetic';
import { toast } from '@/components/ui/Toast';
import PatientPanel, { type PatientPanelAppointment } from '@/components/dashboard/patients/PatientPanel';
import PatientSearchBar from '@/components/dashboard/patients/PatientSearchBar';
import PatientSearchResult from '@/components/dashboard/patients/PatientSearchResult';
import {
  MAX_PATIENT_AGE,
  appendPatientSession,
  getPatientTreatmentStatus,
  isValidManualAge,
  parseManualAge,
  patientTreatmentStatusLabel,
  readManualAge,
  updatePatientSession,
  type PatientSession,
  type PatientSessionDraft,
  type PatientSessionStatus,
} from '@/components/dashboard/patients/smartProfile';
import {
  SEARCH_FETCH_LIMIT,
  SEARCH_RESULT_LIMIT,
  formatDateLongAr,
  formatHijriAr,
  greetingAr,
  isOnIsoDay,
  localIsoDay,
  searchPatients,
  type PatientSearchRecord,
} from '@/lib/services/patientSearch';
import { useClinicContext } from '@/lib/useClinicContext';
import { formatMoney, formatNumber } from '@/lib/clinic/formatting';

/**
 * The patients page lists a selectable creation-date range (today by default)
 * and keeps Arabic-aware search and quick patient previews.
 *
 * The patient panel renders UNDER the results once one is picked, while each
 * result also links directly to the full patient file. Arabic-aware
 * normalisation, ranking, the result cap, and status colours live in
 * `lib/services/patientSearch.ts` so they remain unit tested.
 *
 * The API contract is unchanged: `GET /api/patients` still answers with a BARE
 * ARRAY (only `q` sanitising, a `notes` arm and an optional `limit` were added),
 * so no other consumer of that endpoint can regress.
 */

/** Shared shape for both the "add" and "edit" patient forms. */
const EMPTY_PATIENT_FORM = {
  name: '',
  email: '',
  phone: '',
  source: 'موقع الويب',
  status: 'جديد',
  notes: '',
  /** N15.1 — age in years, typed manually by the receptionist. */
  age: '',
};

type DailySummary = {
  /** null = the source was unavailable (not authorised / failed) → tile hidden. */
  appointmentsToday: number | null;
  newFiles: number | null;
  outstanding: number | null;
};

const EMPTY_SUMMARY: DailySummary = { appointmentsToday: null, newFiles: null, outstanding: null };

type TodayStats = {
  newPatients: number | null;
  invoicesTotal: number | null;
  paymentsTotal: number | null;
  remainingTotal: number | null;
};

const EMPTY_TODAY_STATS: TodayStats = {
  newPatients: null,
  invoicesTotal: null,
  paymentsTotal: null,
  remainingTotal: null,
};

type SmartAlertCounts = {
  overdueDebts: number;
  pendingImaging: number;
  newPatients: number;
  unreadMessages: number;
};

const EMPTY_SMART_ALERT_COUNTS: SmartAlertCounts = {
  overdueDebts: 0,
  pendingImaging: 0,
  newPatients: 0,
  unreadMessages: 0,
};

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>(() =>
    searchParams.get('filter') === 'new_this_week' ? 'week' : 'today'
  );
  const { clinicId, clinicSlug, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [todayStats, setTodayStats] = useState<TodayStats>(EMPTY_TODAY_STATS);
  const [todayStatsLoading, setTodayStatsLoading] = useState(true);

  /** Rows returned for the current debounced query (bounded by `limit`). */
  const [patients, setPatients] = useState<PatientSearchRecord[]>([]);
  const [patientsLoaded, setPatientsLoaded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Debounced query — the bar owns the raw draft and calls back after 300ms. */
  const [query, setQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState<'all' | 'active' | 'closed'>('all');
  /** «عرض الكل (N)» lifts the visible result cap. */
  const [showAll, setShowAll] = useState(false);
  /** The patient whose panel is open — it survives later searches. */
  const [selected, setSelected] = useState<PatientSearchRecord | null>(null);
  const [patientAppointments, setPatientAppointments] = useState<PatientPanelAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  /** Starts TRUE: the first paint (SSR included) shows skeletons, never a fake
   *  «غير متاح» while the three requests are still in flight. */
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [smartAlertCounts, setSmartAlertCounts] = useState<SmartAlertCounts>(EMPTY_SMART_ALERT_COUNTS);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientSearchRecord | null>(null);
  const [formState, setFormState] = useState(EMPTY_PATIENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  /** Form-local validation/save message — kept separate from the search `error`. */
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clinicId) {
      setTodayStats(EMPTY_TODAY_STATS);
      setTodayStatsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTodayStatsLoading(true);
    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch(
          `/api/clinic/patients/today-stats?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers }
        );
        if (!response.ok) throw new Error('تعذر تحميل أداء اليوم');
        const payload = await response.json();
        if (cancelled) return;

        const data = payload?.data;
        setTodayStats({
          newPatients: Number.isFinite(data?.new_patients) ? data.new_patients : null,
          invoicesTotal: Number.isFinite(data?.invoices_total) ? data.invoices_total : null,
          paymentsTotal: Number.isFinite(data?.payments_total) ? data.payments_total : null,
          remainingTotal: Number.isFinite(data?.remaining_total) ? data.remaining_total : null,
        });
      } catch {
        if (!cancelled) setTodayStats(EMPTY_TODAY_STATS);
      } finally {
        if (!cancelled) setTodayStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId]);

  /**
   * The single search request. `q` is sanitised again server-side (PostgREST
   * `.or()` syntax), so a comma in the input can never produce a 500 again.
   */
  const runSearch = useCallback(
    async (term: string) => {
      if (!clinicId) return;
      setSearching(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const hasSearchTerm = Boolean(term.trim());
        const qs = new URLSearchParams({
          clinic_id: clinicId,
          limit: hasSearchTerm ? String(SEARCH_FETCH_LIMIT) : '500',
        });
        if (hasSearchTerm) {
          qs.set('q', term);
        } else {
          qs.set('date_filter', dateFilter);
        }
        if (!hasSearchTerm && dateFilter === 'today') {
          qs.set('timezone_offset', String(new Date().getTimezoneOffset()));
        }
        const res = await fetch(`/api/patients?${qs.toString()}`, { headers });
        if (!res.ok) throw new Error('بيانات المرضى غير متاحة');
        const payload = await res.json();
        setPatients(Array.isArray(payload) ? payload : []);
      } catch (caughtError) {
        setPatients([]);
        setError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ غير معروف');
      } finally {
        setPatientsLoaded(true);
        setSearching(false);
      }
    },
    [authHeaders, clinicId, dateFilter]
  );

  /**
   * B51-H2 — the clinic-context failure is rendered LIVE below, never copied
   * into this page's state: a one-shot copy of `clinicError` into the page's
   * `error` was never cleared, so one transient config/network failure
   * (including the async health-check's initial `false`, pre-B51-H) stuck to the
   * page forever — and re-appeared inside the «إضافة مريض» form's action row
   * even though `/api/supabase-config` reported `isConfigured: true`.
   */
  useEffect(() => {
    if (clinicLoading) {
      setSearching(true);
      return;
    }
    if (!clinicId) {
      setSearching(false);
      return;
    }
    void runSearch(query);
  }, [clinicLoading, clinicId, clinicError, query, runSearch]);

  /** B48 — appointments for ONE patient (`patient_id` filter) + `{ data }` envelope. */
  useEffect(() => {
    if (!selected?.id || !clinicId) {
      setPatientAppointments([]);
      return;
    }
    let cancelled = false;
    setAppointmentsLoading(true);
    authHeaders().then((headers) => {
      fetch(
        `/api/appointments?clinic_id=${encodeURIComponent(clinicId)}&patient_id=${encodeURIComponent(selected.id)}`,
        { headers }
      )
        .then(async (res) => {
          if (!res.ok) throw new Error('Failed to load appointments');
          return res.json();
        })
        .then((body) => {
          if (cancelled) return;
          setPatientAppointments(Array.isArray(body?.data) ? body.data : []);
        })
        .catch(() => {
          if (!cancelled) setPatientAppointments([]);
        })
        .finally(() => {
          if (!cancelled) setAppointmentsLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, clinicId, authHeaders]);

  /**
   * Daily summary — three INDEPENDENT sources, so a role that may not read
   * finance still gets the other two tiles (`allSettled`, never `all`).
   */
  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    setSummaryLoading(true);
    const today = localIsoDay();

    (async () => {
      const headers = await authHeaders();
      const getJson = (url: string) =>
        fetch(url, { headers }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(url))));

      const [overview, files, invoices] = await Promise.allSettled([
        getJson(`/api/clinic/overview?clinic_id=${encodeURIComponent(clinicId)}`),
        getJson(`/api/clinic/medical-files/list?clinic_id=${encodeURIComponent(clinicId)}`),
        getJson(`/api/clinic/accounting/invoices?clinic_id=${encodeURIComponent(clinicId)}`),
      ]);
      if (cancelled) return;

      const next: DailySummary = { ...EMPTY_SUMMARY };
      if (overview.status === 'fulfilled') {
        const rows = overview.value?.data?.today_appointments;
        next.appointmentsToday = Array.isArray(rows) ? rows.length : 0;
      }
      if (files.status === 'fulfilled') {
        const rows = Array.isArray(files.value?.data) ? files.value.data : [];
        next.newFiles = rows.filter((row: any) => isOnIsoDay(row?.created_at, today)).length;
      }
      if (invoices.status === 'fulfilled') {
        const rows = Array.isArray(invoices.value?.data) ? invoices.value.data : [];
        next.outstanding = rows.reduce(
          (sum: number, row: any) => sum + Math.max(Number(row?.balance_amount ?? 0) || 0, 0),
          0
        );
      }
      setSummary(next);
      setSummaryLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setSummary(EMPTY_SUMMARY);
      setSummaryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authHeaders, clinicId]);

  /** Smart alert totals come from clinic-scoped APIs; failed sources stay at zero. */
  useEffect(() => {
    let cancelled = false;
    setSmartAlertCounts(EMPTY_SMART_ALERT_COUNTS);
    if (!clinicId) return () => { cancelled = true; };

    (async () => {
      const headers = await authHeaders();
      const getJson = (url: string) =>
        fetch(url, { headers }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(url))));
      const now = Date.now();
      const [aging, referrals, patientsResponse, messages] = await Promise.allSettled([
        getJson(`/api/clinic/accounting/aging?clinic_id=${encodeURIComponent(clinicId)}`),
        getJson(`/api/imaging/referrals?clinic_id=${encodeURIComponent(clinicId)}&direction=outgoing`),
        getJson(`/api/patients?clinic_id=${encodeURIComponent(clinicId)}&limit=500`),
        getJson(`/api/clinic/messages?clinic_id=${encodeURIComponent(clinicId)}`),
      ]);
      if (cancelled) return;

      const outstandingRows = aging.status === 'fulfilled' && Array.isArray(aging.value?.data?.rows)
        ? aging.value.data.rows
        : [];
      const referralRows = referrals.status === 'fulfilled' && Array.isArray(referrals.value?.data)
        ? referrals.value.data
        : [];
      const patientRows = patientsResponse.status === 'fulfilled' && Array.isArray(patientsResponse.value)
        ? patientsResponse.value
        : [];
      const conversationRows = messages.status === 'fulfilled' && Array.isArray(messages.value?.data)
        ? messages.value.data
        : [];
      const activeReferralStatuses = new Set([
        'pending', 'requested', 'submitted', 'accepted', 'scheduled',
        'in_progress', 'ready', 'needs_clarification',
      ]);
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

      setSmartAlertCounts({
        overdueDebts: aging.status === 'fulfilled'
          ? outstandingRows.filter((row: any) => Number(row?.balance_amount) > 0 && Number(row?.age_days) > 0).length
          : 0,
        pendingImaging: referrals.status === 'fulfilled'
          ? referralRows.filter((row: any) => activeReferralStatuses.has(String(row?.status ?? '').toLowerCase())).length
          : 0,
        newPatients: patientsResponse.status === 'fulfilled'
          ? patientRows.filter((row: any) => {
              const createdAt = Date.parse(row?.created_at ?? '');
              return Number.isFinite(createdAt) && createdAt >= weekAgo && createdAt <= now;
            }).length
          : 0,
        unreadMessages: messages.status === 'fulfilled'
          ? conversationRows.reduce(
              (total: number, row: any) => total + Math.max(0, Number(row?.unread_count) || 0),
              0
            )
          : 0,
      });
    })().catch(() => {
      if (!cancelled) setSmartAlertCounts(EMPTY_SMART_ALERT_COUNTS);
    });

    return () => { cancelled = true; };
  }, [authHeaders, clinicId]);

  /**
   * N26 — one writer for the whole plan. Like the detail page, ONLY the
   * `sessions` key is sent (the PUT route shallow-merges `body.metadata`), so a
   * session can never clobber quick notes, medical history or the manual age.
   */
  const persistSessions = useCallback(
    async (next: PatientSession[], failureMessage: string) => {
      if (!clinicId || !selected) throw new Error('لم يتم تحديد المريض');
      const headers = await authHeaders();
      const res = await fetch(
        `/api/patients/${encodeURIComponent(selected.id)}?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { sessions: next } }),
        }
      );
      if (!res.ok) {
        if (res.status === 401) throw new Error('انتهت الجلسة — أعد تسجيل الدخول ثم أعد المحاولة');
        if (res.status === 404) throw new Error('لم يُعثر على هذا المريض في هذه العيادة');
        throw new Error(failureMessage);
      }
      const merge = (record: PatientSearchRecord): PatientSearchRecord =>
        record.id === selected.id
          ? { ...record, metadata: { ...(record.metadata ?? {}), sessions: next } }
          : record;
      setSelected((current) => (current ? merge(current) : current));
      setPatients((current) => current.map(merge));
    },
    [authHeaders, clinicId, selected]
  );

  const addSession = useCallback(
    async (draft: PatientSessionDraft) => {
      if (!selected) throw new Error('لم يتم تحديد المريض');
      await persistSessions(
        appendPatientSession(selected.metadata, draft).sessions,
        'تعذر حفظ الجلسة — حاول مرة أخرى'
      );
    },
    [persistSessions, selected]
  );

  const changeSessionStatus = useCallback(
    async (session: PatientSession, status: PatientSessionStatus) => {
      if (!selected) throw new Error('لم يتم تحديد المريض');
      await persistSessions(
        updatePatientSession(selected.metadata, session.id, { status }).sessions,
        'تعذر تحديث الجلسة — حاول مرة أخرى'
      );
    },
    [persistSessions, selected]
  );

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState.name.trim() || !clinicId) return;
    // N15.1 — the age is typed manually now, so validate it instead of a birth date.
    if (!isValidManualAge(formState.age)) {
      setFormError(`العمر غير صالح (أدخل عدد سنوات بين 0 و ${MAX_PATIENT_AGE}).`);
      return;
    }
    const ageYears = formState.age.trim() ? parseManualAge(formState.age) : null;
    setFormError(null);
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const url = editingPatient
        ? `/api/patients/${editingPatient.id}?clinic_id=${encodeURIComponent(clinicId)}`
        : '/api/patients';
      const response = await fetch(url, {
        method: editingPatient ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          ...(editingPatient ? { id: editingPatient.id } : {}),
          clinic_id: clinicId,
          name: formState.name,
          email: formState.email,
          phone: formState.phone,
          source: formState.source,
          status: formState.status,
          notes: formState.notes,
          // N15.1 — stored flat in metadata; `parsePatientMetadata` mirrors it
          // into `basic_info.age` for the profile, and null clears the field.
          metadata: { age: ageYears === null ? null : String(ageYears) },
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || 'Unable to save patient');
      }
      const savedPatient = (await response.json()) as PatientSearchRecord;
      setPatients((current) => {
        if (editingPatient) return current.map((row) => (row.id === editingPatient.id ? { ...row, ...savedPatient } : row));
        return [savedPatient, ...current.filter((row) => row.id !== savedPatient.id)];
      });
      // N28 — a saved patient opens straight into the panel (no list to scroll).
      setSelected(savedPatient);
      setIsFormOpen(false);
      setEditingPatient(null);
      setFormState({ ...EMPTY_PATIENT_FORM });
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : 'Failed to save patient');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(patientId: string) {
    if (!confirm('هل تريد حذف هذا المريض؟')) return;
    try {
      const headers = await authHeaders();
      const response = await fetch(
        `/api/patients/${patientId}?clinic_id=${encodeURIComponent(clinicId || '')}`,
        { method: 'DELETE', headers }
      );
      if (!response.ok) throw new Error('Unable to delete patient');
      setPatients((current) => current.filter((row) => row.id !== patientId));
      setSelected((current) => (current?.id === patientId ? null : current));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to delete patient');
    }
  }

  const visiblePatients = useMemo(
    () =>
      patients.filter((patient) => {
        if (query.trim()) return true;
        const status = getPatientTreatmentStatus(patient.metadata);
        if (treatmentFilter === 'all') return true;
        return treatmentFilter === 'active' ? status === 'active' : status === 'closed';
      }),
    [patients, query, treatmentFilter]
  );

  /** Rows are ordered by creation time by the API; active searches ignore list filters. */
  const outcome = useMemo(
    () => {
      if (!query.trim()) {
        const limit = showAll ? visiblePatients.length : SEARCH_RESULT_LIMIT;
        return {
          results: visiblePatients.slice(0, limit),
          total: visiblePatients.length,
          hasMore: visiblePatients.length > limit,
          query: '',
        };
      }
      return searchPatients(visiblePatients, query, showAll ? Math.max(visiblePatients.length, SEARCH_RESULT_LIMIT) : SEARCH_RESULT_LIMIT);
    },
    [visiblePatients, query, showAll]
  );

  const greeting = useMemo(() => greetingAr(), []);
  const longDate = useMemo(() => formatDateLongAr(), []);
  const hijriDate = useMemo(() => formatHijriAr(), []);
  const quickActions = useMemo(
    () => [
      { label: '+ مريض', href: '#', icon: '＋', tone: 'cyan' },
      { label: '+ موعد', href: `/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/appointments?date=today`, icon: '📅', tone: 'sky' },
      { label: '+ فاتورة', href: `/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/financial-intelligence?status=unpaid`, icon: '💰', tone: 'amber' },
      { label: '🩻 رفع', href: `/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/medical-files?status=new`, icon: '🩻', tone: 'violet' },
    ],
    [clinicSlug]
  );

  const smartAlerts = useMemo(
    () => {
      const base = `/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}`;
      return [
        {
          icon: '⚠️',
          label: `${smartAlertCounts.overdueDebts} مديونيات متأخرة`,
          tone: 'rose',
          description: 'إجراءات متابعة مطلوبة خلال 24 ساعة',
          href: `${base}/debts`,
        },
        {
          icon: '🩻',
          label: `${smartAlertCounts.pendingImaging} بانتظار نتائج أشعة`,
          tone: 'violet',
          description: 'نتائج قادمة من المعمل أو الأشعة',
          href: `${base}/imaging?filter=pending`,
        },
        {
          icon: '📅',
          label: `${smartAlertCounts.newPatients} مرضى جدد هذا الأسبوع`,
          tone: 'cyan',
          description: 'تحديثات حديثة في قائمة المرضى',
          href: `${base}/patients?filter=new_this_week`,
        },
        {
          icon: '💬',
          label: `${smartAlertCounts.unreadMessages} رسالة غير مقروءة`,
          tone: 'amber',
          description: 'رسالة جديدة من المريض أو من العيادة',
          href: `${base}/messages`,
        },
      ];
    },
    [clinicSlug, smartAlertCounts]
  );

  const handleAlertClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string, label: string) => {
      toast.info(`جاري فتح ${label}...`, {
        title: 'تنبيه ذكي',
        duration: 2500,
      });
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.push(href);
    },
    [router]
  );

  // TODO: Restore a real activity feed when the clinic activity log API is available.

  const hasQuery = query.trim().length > 0;
  const hasPatientResults = hasQuery || patientsLoaded;
  const hint = hasPatientResults ? (outcome.total === 1 ? 'نتيجة واحدة' : `${outcome.total} نتائج`) : null;

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    if (next.trim()) setTreatmentFilter('all');
    setShowAll(false);
  }, []);

  const handleDateFilterChange = useCallback((next: 'today' | 'week' | 'all') => {
    setDateFilter(next);
    setShowAll(false);
    setSelected(null);
    setPatientsLoaded(false);
  }, []);

  return (
    <DashboardSection
      title="المرضى"
      subtitle="اعرض المرضى حسب تاريخ الإضافة، وابحث وافتح الملف الطبي الكامل."
      action={
        <Magnetic>
          <ShimmerButton
            onClick={() => {
              setEditingPatient(null);
              setFormState({ ...EMPTY_PATIENT_FORM });
              setFormError(null);
              setIsFormOpen((current) => !current);
            }}
            style={{ background: 'linear-gradient(120deg,#06b6d4,#0ea5e9,#10b981)' }}
            className="rounded-full px-5 py-3 text-sm font-bold text-slate-950"
          >
            {isFormOpen ? '✕ إلغاء' : '+ إضافة مريض'}
          </ShimmerButton>
        </Magnetic>
      }
    >
      <div className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TodayPerformanceCard
          label="مرضى جدد اليوم"
          value={todayStats.newPatients}
          loading={todayStatsLoading}
          icon={Users}
          tone="blue"
          index={0}
        />
        <TodayPerformanceCard
          label="إجمالي الفواتير"
          value={todayStats.invoicesTotal}
          loading={todayStatsLoading}
          icon={FileText}
          tone="violet"
          money
          index={1}
        />
        <TodayPerformanceCard
          label="المبلغ المسدد اليوم"
          value={todayStats.paymentsTotal}
          loading={todayStatsLoading}
          icon={Wallet}
          tone="emerald"
          money
          highlight
          index={2}
        />
        <TodayPerformanceCard
          label="المبلغ المتبقي اليوم"
          value={todayStats.remainingTotal}
          loading={todayStatsLoading}
          icon={AlertCircle}
          tone="orange"
          money
          index={3}
        />
      </div>

      {/* 🌅 Greeting + date (Gregorian · Hijri). */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-2xl font-semibold text-white md:text-3xl">
            <span aria-hidden>{greeting.emoji}</span> {greeting.text}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {longDate}
            {hijriDate ? <span className="text-slate-500"> • {hijriDate}</span> : null}
          </p>
        </div>
        <p className="rounded-full border border-slate-800 px-3 py-1 text-[11px] text-slate-500">
          🔍 النتائج حسب الفترة والبحث
        </p>
      </motion.div>

      {/* 🔍 The search field — the only entry point to a patient. */}
      <div className="mb-7">
        <PatientSearchBar
          value={query}
          onChange={handleQueryChange}
          loading={searching}
          hint={hint}
          autoFocus
          onEscape={() => {
            setShowAll(false);
            setSelected(null);
          }}
        />
      </div>

      {/* 📊 Daily summary — hidden as soon as the receptionist starts searching. */}
      <AnimatePresence initial={false}>
        {!hasQuery && !isFormOpen ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile
                href={`/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/appointments?date=today`}
                emoji="📅"
                label="مواعيد اليوم"
                value={summary.appointmentsToday}
                loading={summaryLoading}
                accent="from-cyan-500/20 to-sky-500/10 ring-cyan-500/25"
              />
              <SummaryTile
                href={`/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/medical-files?status=new`}
                emoji="🩻"
                label="ملفات جديدة"
                value={summary.newFiles}
                loading={summaryLoading}
                accent="from-violet-500/20 to-fuchsia-500/10 ring-violet-500/25"
              />
              <SummaryTile
                href={`/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/financial-intelligence?status=unpaid`}
                emoji="💰"
                label="مستحقات غير مسدَّدة"
                value={summary.outstanding}
                loading={summaryLoading}
                accent="from-amber-500/20 to-orange-500/10 ring-amber-500/25"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {quickActions.map((action) => {
                const classes =
                  action.tone === 'cyan'
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
                    : action.tone === 'sky'
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20'
                      : action.tone === 'amber'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                        : 'border-violet-500/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20';

                if (action.href === '#') {
                  return (
                    <QuickActionPill
                      key={action.label}
                      className={classes}
                      onClick={() => {
                        setEditingPatient(null);
                        setFormState({ ...EMPTY_PATIENT_FORM });
                        setFormError(null);
                        setIsFormOpen(true);
                        toast.info('جاري فتح نموذج إضافة مريض...', {
                          title: 'إجراء سريع',
                          duration: 2500,
                        });
                      }}
                    >
                      {action.label}
                    </QuickActionPill>
                  );
                }

                return (
                  <QuickActionPill
                    key={action.label}
                    href={action.href}
                    className={classes}
                    onClick={() => {
                      toast.info(`جاري فتح ${action.label}...`, {
                        title: 'إجراء سريع',
                        duration: 2500,
                      });
                      router.push(action.href);
                    }}
                  >
                    {action.label}
                  </QuickActionPill>
                );
              })}
            </div>

            <div className="grid gap-3">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">تنبيهات ذكية</p>
                  <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] font-bold text-slate-300">
                    4 عناصر
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {smartAlerts.map((alert) => (
                    <Link
                      key={alert.label}
                      href={alert.href}
                      onClick={(event) => handleAlertClick(event, alert.href, alert.label)}
                      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      <motion.div
                        whileHover={{ y: -4, scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        className={`relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br px-3 py-3 transition-colors duration-200 hover:border-slate-700 hover:bg-slate-900/80 ${
                          alert.tone === 'rose'
                            ? 'from-rose-500/10 to-red-500/5'
                            : alert.tone === 'violet'
                              ? 'from-violet-500/10 to-indigo-500/5'
                              : alert.tone === 'cyan'
                                ? 'from-cyan-500/10 to-sky-500/5'
                                : 'from-amber-500/10 to-orange-500/5'
                        }`}
                      >
                        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.14),_transparent_35%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                        <div className="relative z-10 flex items-start gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/70 text-lg">
                            {alert.icon}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-white">{alert.label}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{alert.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* TODO: Restore this panel when a real clinic activity log API is available. */}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ➕ Add / edit form — unchanged behaviour, now inside a motion shell. */}
      <AnimatePresence initial={false}>
        {isFormOpen ? (
          <motion.form
            key="patient-form"
            onSubmit={handleSave}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/70"
          >
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <input
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                placeholder="اسم المريض"
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
                required
              />
              <input
                value={formState.email}
                onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                placeholder="البريد الإلكتروني"
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
              />
              <input
                value={formState.phone}
                onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                placeholder="رقم الهاتف"
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
              />
              <div>
                <label htmlFor="patient-age" className="mb-1 block text-xs text-slate-400">
                  العمر (بالسنوات — يُدخل يدويًا)
                </label>
                <input
                  id="patient-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_PATIENT_AGE}
                  step={1}
                  dir="ltr"
                  placeholder="مثال: 35"
                  value={formState.age}
                  onChange={(event) => setFormState((current) => ({ ...current, age: event.target.value }))}
                  className="w-full rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
                />
              </div>
              <select
                value={formState.source}
                onChange={(event) => setFormState((current) => ({ ...current, source: event.target.value }))}
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
              >
                <option value="موقع الويب">الموقع الإلكتروني</option>
                <option value="الهاتف">الهاتف</option>
                <option value="الحضور">حضور مباشر</option>
              </select>
              <select
                value={formState.status}
                onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))}
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100"
              >
                <option value="جديد">جديد</option>
                <option value="قيد المتابعة">قيد المتابعة</option>
                <option value="مؤكد">مؤكد</option>
              </select>
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="ملاحظات طبية"
                className="rounded-3xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 md:col-span-2"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                {submitting ? 'جارٍ الحفظ...' : editingPatient ? 'حفظ التعديلات' : 'إنشاء مريض'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingPatient(null);
                  setFormState({ ...EMPTY_PATIENT_FORM });
                }}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300"
              >
                إلغاء
              </button>
              {formError || clinicError || error ? (
                <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                  {formError ?? clinicError ?? error}
                </p>
              ) : null}
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="patient-date-filter" className="text-sm text-slate-400">
            {hasQuery ? 'تاريخ الإضافة (يُتجاهل أثناء البحث)' : 'تاريخ الإضافة'}
          </label>
          <select
            id="patient-date-filter"
            value={dateFilter}
            disabled={hasQuery}
            onChange={(event) => handleDateFilterChange(event.target.value as 'today' | 'week' | 'all')}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="today">اليوم</option>
            <option value="week">آخر 7 أيام</option>
            <option value="all">الكل</option>
          </select>
        </div>
        {patientsLoaded && !error && !clinicError ? (
          <p className="text-sm text-slate-400" aria-live="polite">
            {hasQuery ? 'نتائج البحث:' : 'عدد المرضى ضمن الفترة:'}{' '}
            <span className="font-semibold text-cyan-200">{outcome.total}</span>
          </p>
        ) : null}
      </div>

      {hasPatientResults && !hasQuery && (
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'active', 'closed'].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setTreatmentFilter(filter as 'all' | 'active' | 'closed')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                treatmentFilter === filter
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
              }`}
            >
              {filter === 'all' ? 'الكل' : filter === 'active' ? 'نشط' : 'منتهي'}
            </button>
          ))}
        </div>
      )}

      {/* 🔎 Results — the panel opens UNDER them, never in a modal. */}
      <AnimatePresence mode="wait">
        {hasPatientResults ? (
          <motion.div
            key="results"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -10 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {searching && outcome.results.length === 0 ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-24" />
                ))}
              </div>
            ) : clinicError || error ? (
              <EmptyState title="خدمة المرضى غير متاحة" description={clinicError ?? error} />
            ) : outcome.results.length === 0 ? (
              <EmptyState
                title="لا نتائج مطابقة"
                description="جرّب الاسم بدون همزات، أو جزءاً من رقم الهاتف أو البريد أو الملاحظة."
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {outcome.results.map((result, index) => (
                    <PatientSearchResult
                      key={result.id}
                      index={index}
                      patient={{
                        ...result,
                        status: patientTreatmentStatusLabel(result.metadata),
                      }}
                      query={outcome.query}
                      active={selected?.id === result.id}
                      clinicSlug={clinicSlug}
                      onSelect={(next) => setSelected({ ...next, status: patientTreatmentStatusLabel(next.metadata) })}
                    />
                  ))}
                </div>

                {outcome.hasMore && !showAll ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      عرض الكل ({outcome.total})
                    </button>
                  </div>
                ) : null}

                {showAll && outcome.total > SEARCH_RESULT_LIMIT ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowAll(false)}
                      className="rounded-full border border-slate-700 px-5 py-2 text-xs text-slate-300 transition hover:border-slate-500"
                    >
                      إظهار أول {SEARCH_RESULT_LIMIT}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 📋💊📁 The patient panel. */}
      <AnimatePresence>
        {selected ? (
          <div className="mt-6">
            <PatientPanel
              key={selected.id}
              patient={{ ...selected, status: patientTreatmentStatusLabel(selected.metadata) }}
              clinicId={clinicId ?? null}
              clinicSlug={clinicSlug}
              authHeaders={authHeaders}
              appointments={patientAppointments}
              appointmentsLoading={appointmentsLoading}
              onEdit={() => {
                setEditingPatient(selected);
                setFormState({
                  name: selected.name,
                  email: selected.email ?? '',
                  phone: selected.phone ?? '',
                  source: selected.source ?? 'موقع الويب',
                  status: selected.status ?? 'جديد',
                  notes: selected.notes ?? '',
                  age: readManualAge(selected.metadata),
                });
                setFormError(null);
                setIsFormOpen(true);
              }}
              onClose={() => setSelected(null)}
              onDelete={() => handleDelete(selected.id)}
              onAddSession={addSession}
              onSessionStatusChange={changeSessionStatus}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </DashboardSection>
  );
}

type RippleDot = { id: number; x: number; y: number; size: number };

function QuickActionPill({
  children,
  href,
  onClick,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className: string;
}) {
  const [ripples, setRipples] = useState<RippleDot[]>([]);

  const spawn = (event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    const id = Date.now() + Math.random();
    setRipples((current) => [...current, { id, x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size }]);
    window.setTimeout(() => setRipples((current) => current.filter((dot) => dot.id !== id)), 650);
  };

  const content = (
    <>
      <span className="relative z-10">{children}</span>
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        {ripples.map((dot) => (
          <motion.span
            key={dot.id}
            initial={{ scale: 0, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: dot.x,
              top: dot.y,
              width: dot.size,
              height: dot.size,
              borderRadius: '9999px',
              background: 'currentColor',
            }}
          />
        ))}
      </span>
    </>
  );

  const sharedClassName = `group relative inline-flex items-center overflow-hidden rounded-full border px-3 py-2 text-xs font-bold shadow-[0_12px_22px_-18px_rgba(15,23,42,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_25px_-20px_rgba(59,130,246,0.6)] ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        onPointerDown={spawn}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onClick?.();
        }}
        className={sharedClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onPointerDown={spawn} onClick={onClick} className={sharedClassName}>
      {content}
    </button>
  );
}

/**
 * One KPI of the daily summary. A value of `null` means the source was not
 * readable for this role — that renders as a note, never as a fake zero.
 */
function SummaryTile({
  emoji,
  label,
  value,
  loading,
  accent,
  href,
}: {
  emoji: string;
  label: string;
  value: number | null;
  loading: boolean;
  accent: string;
  href: string;
}) {
  const content = (
    <>
      <p className="text-xs text-slate-300">
        <span aria-hidden>{emoji}</span> {label}
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : value === null ? (
        <p className="mt-2 text-sm text-slate-500">غير متاح لصلاحيتك</p>
      ) : (
        <p className="mt-1 text-2xl font-bold text-white">
          <NumberTicker value={value} />
        </p>
      )}
    </>
  );

  return (
    <motion.div whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} className="relative h-full">
      <Link
        href={href}
        className={`group relative block h-full overflow-hidden rounded-[1.5rem] border border-slate-800 bg-gradient-to-br ${accent} px-4 py-4 ring-1 backdrop-blur-sm shadow-[0_20px_35px_-28px_rgba(14,165,233,0.7)] transition-all duration-300 before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-200 before:content-[''] hover:shadow-[0_28px_38px_-24px_rgba(94,234,212,0.9)] hover:before:opacity-100 hover:before:bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_45%)]`}
      >
        <span className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.08),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white/25 transition-transform duration-500 group-active:scale-[12]" />
        <span className="relative z-10 block">{content}</span>
        <span className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold text-white/80">
          افتح <span aria-hidden>→</span>
        </span>
      </Link>
    </motion.div>
  );
}

function TodayPerformanceCard({
  label,
  value,
  loading,
  icon: Icon,
  tone,
  index,
  money = false,
  highlight = false,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  icon: LucideIcon;
  tone: 'blue' | 'violet' | 'emerald' | 'orange';
  index: number;
  money?: boolean;
  highlight?: boolean;
}) {
  const toneStyles = {
    blue: {
      border: 'border-sky-400/20',
      background: 'from-sky-500/15 via-slate-900/80 to-slate-950/90',
      icon: 'bg-sky-400/15 text-sky-300',
      label: 'text-sky-100/80',
      value: 'text-white',
      shadow: 'shadow-sky-950/30',
    },
    violet: {
      border: 'border-violet-400/20',
      background: 'from-violet-500/15 via-slate-900/80 to-slate-950/90',
      icon: 'bg-violet-400/15 text-violet-300',
      label: 'text-violet-100/80',
      value: 'text-white',
      shadow: 'shadow-violet-950/30',
    },
    emerald: {
      border: 'border-emerald-300/35',
      background: 'from-emerald-500/25 via-emerald-950/80 to-slate-950/90',
      icon: 'bg-emerald-300/20 text-emerald-200',
      label: 'text-emerald-50',
      value: 'text-white',
      shadow: 'shadow-emerald-950/50',
    },
    orange: {
      border: 'border-orange-400/20',
      background: 'from-orange-500/15 via-slate-900/80 to-slate-950/90',
      icon: 'bg-orange-400/15 text-orange-300',
      label: 'text-orange-100/80',
      value: 'text-white',
      shadow: 'shadow-orange-950/30',
    },
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{
        opacity: { duration: 0.4, delay: index * 0.1 },
        y: { duration: 0.4, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] },
      }}
      className={`group relative isolate overflow-hidden rounded-2xl border ${toneStyles.border} bg-gradient-to-br ${toneStyles.background} p-4 shadow-xl ${toneStyles.shadow} backdrop-blur-md transition-shadow duration-300 hover:shadow-2xl sm:rounded-3xl sm:p-5`}
    >
      {highlight ? (
        <>
          <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-emerald-300/20 blur-3xl animate-blob-drift" />
          <span className="pointer-events-none absolute -bottom-12 left-4 h-32 w-32 rounded-full bg-teal-400/15 blur-3xl animate-blob-drift [animation-delay:-7s]" />
        </>
      ) : null}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold leading-5 sm:text-sm ${toneStyles.label}`}>{label}</p>
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneStyles.icon} ${
            highlight ? 'shadow-glow-emerald transition-all duration-300 group-hover:scale-110' : ''
          }`}
        >
          <Icon aria-hidden="true" size={19} />
        </span>
      </div>
      <div className="relative z-10 mt-4">
        {highlight ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 0.7, y: 0 }}
            transition={{ duration: 0.7, delay: index * 0.1 + 0.15, ease: 'easeOut' }}
            dir="rtl"
            lang="ar"
            className="mb-1 font-heading text-[11px] leading-relaxed text-emerald-100 opacity-70 sm:text-xs"
          >
            ﴿لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ﴾
          </motion.p>
        ) : null}
        <div className="flex min-h-8 items-center gap-2">
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : value === null ? (
            <span className="text-sm font-medium text-slate-300">غير متاح</span>
          ) : (
            <>
              <AnimatedStatValue value={value} money={money} className={`text-xl font-extrabold tracking-tight sm:text-2xl ${toneStyles.value}`} />
              {highlight ? (
                <TrendingUp aria-label="اتجاه صاعد" size={18} className="text-emerald-300 drop-shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
              ) : null}
            </>
          )}
        </div>
      </div>
      {highlight ? (
        <p className="relative z-10 mt-1 text-[11px] font-medium text-emerald-100/65">إجمالي ما تم تحصيله اليوم</p>
      ) : null}
    </motion.div>
  );
}

function AnimatedStatValue({
  value,
  money,
  className,
}: {
  value: number;
  money: boolean;
  className: string;
}) {
  const animatedValue = useMotionValue(0);
  const displayValue = useTransform(animatedValue, (current) =>
    money ? formatMoney(current, 'ILS') : formatNumber(Math.round(current), 'ar')
  );

  useEffect(() => {
    const controls = animate(animatedValue, value, { duration: 1.2, ease: 'easeOut' });
    return controls.stop;
  }, [animatedValue, value]);

  return <motion.span className={className}>{displayValue}</motion.span>;
}
