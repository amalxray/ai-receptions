'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Magnetic } from '@/components/ui/magnetic';
import PatientPanel, { type PatientPanelAppointment } from '@/components/dashboard/patients/PatientPanel';
import PatientSearchBar from '@/components/dashboard/patients/PatientSearchBar';
import PatientSearchResult from '@/components/dashboard/patients/PatientSearchResult';
import {
  MAX_PATIENT_AGE,
  appendPatientSession,
  isValidManualAge,
  parseManualAge,
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

/**
 * N28 — the patients page is SEARCH, not a list.
 *
 * There is deliberately no patient list on open (B47 removed the paged table,
 * and a list is what also made the demo/seeded rows look wrong): the page opens
 * on a greeting + a big search field + a three-tile day summary, and the patient
 * panel renders UNDER the results once one is picked. Everything Arabic-aware
 * (normalisation, ranking, the 10-row cap, status colours) lives in
 * `lib/services/patientSearch.ts` so it is unit tested.
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

export default function PatientsPage() {
  const { clinicId, clinicSlug, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();

  /** Rows the API returned for the CURRENT debounced query (bounded by `limit`). */
  const [patients, setPatients] = useState<PatientSearchRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Debounced query — the bar owns the raw draft and calls back after 300ms. */
  const [query, setQuery] = useState('');
  /** «عرض الكل (N)» lifts the 10-row display cap. */
  const [showAll, setShowAll] = useState(false);
  /** The patient whose panel is open — it survives later searches. */
  const [selected, setSelected] = useState<PatientSearchRecord | null>(null);
  const [patientAppointments, setPatientAppointments] = useState<PatientPanelAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [summary, setSummary] = useState<DailySummary>(EMPTY_SUMMARY);
  /** Starts TRUE: the first paint (SSR included) shows skeletons, never a fake
   *  «غير متاح» while the three requests are still in flight. */
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientSearchRecord | null>(null);
  const [formState, setFormState] = useState(EMPTY_PATIENT_FORM);
  const [submitting, setSubmitting] = useState(false);
  /** Form-local validation/save message — kept separate from the search `error`. */
  const [formError, setFormError] = useState<string | null>(null);

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
        const qs = new URLSearchParams({ clinic_id: clinicId, limit: String(SEARCH_FETCH_LIMIT) });
        if (term.trim()) qs.set('q', term);
        const res = await fetch(`/api/patients?${qs.toString()}`, { headers });
        if (!res.ok) throw new Error('بيانات المرضى غير متاحة');
        const payload = await res.json();
        setPatients(Array.isArray(payload) ? payload : []);
      } catch (caughtError) {
        setPatients([]);
        setError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ غير معروف');
      } finally {
        setSearching(false);
      }
    },
    [authHeaders, clinicId]
  );

  /** No query → no rows. That is the whole point of a search-only page. */
  useEffect(() => {
    if (clinicLoading) {
      setSearching(true);
      return;
    }
    if (!clinicId) {
      if (clinicError) setError(clinicError);
      setSearching(false);
      return;
    }
    if (!query.trim()) {
      setPatients([]);
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

  /** Ranked + capped view of the API rows for the current query. */
  const outcome = useMemo(
    () =>
      searchPatients(patients, query, showAll ? Math.max(patients.length, SEARCH_RESULT_LIMIT) : SEARCH_RESULT_LIMIT),
    [patients, query, showAll]
  );

  const greeting = useMemo(() => greetingAr(), []);
  const longDate = useMemo(() => formatDateLongAr(), []);
  const hijriDate = useMemo(() => formatHijriAr(), []);

  const hasQuery = query.trim().length > 0;
  const hint = hasQuery ? (outcome.total === 1 ? 'نتيجة واحدة' : `${outcome.total} نتائج`) : null;

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    setShowAll(false);
  }, []);

  return (
    <DashboardSection
      title="المرضى"
      subtitle="ابحث عن المريض وافتح ملفه دون مغادرة الصفحة — لا قوائم ولا ترقيم."
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
      {/* 🌅 The open state: greeting + date (Gregorian · Hijri). */}
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
          🔍 ابحث لتظهر النتائج أسفل الصفحة
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
            className="mb-6 grid gap-3 sm:grid-cols-3"
          >
            <SummaryTile
              emoji="📅"
              label="مواعيد اليوم"
              value={summary.appointmentsToday}
              loading={summaryLoading}
              accent="from-cyan-500/20 to-sky-500/10 ring-cyan-500/25"
            />
            <SummaryTile
              emoji="🩻"
              label="ملفات جديدة"
              value={summary.newFiles}
              loading={summaryLoading}
              accent="from-violet-500/20 to-fuchsia-500/10 ring-violet-500/25"
            />
            <SummaryTile
              emoji="💰"
              label="مستحقات غير مسدَّدة"
              value={summary.outstanding}
              loading={summaryLoading}
              accent="from-amber-500/20 to-orange-500/10 ring-amber-500/25"
            />
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
              {formError || error ? (
                <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                  {formError ?? error}
                </p>
              ) : null}
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      {/* 🔎 Results (max 10) — the panel opens UNDER them, never in a modal. */}
      <AnimatePresence mode="wait">
        {hasQuery ? (
          <motion.div
            key="results"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -10 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {searching && outcome.results.length === 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-24" />
                ))}
              </div>
            ) : error ? (
              <EmptyState title="خدمة المرضى غير متاحة" description={error} />
            ) : outcome.results.length === 0 ? (
              <EmptyState
                title="لا نتائج مطابقة"
                description="جرّب الاسم بدون همزات، أو جزءاً من رقم الهاتف أو البريد أو الملاحظة."
              />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {outcome.results.map((result) => (
                    <PatientSearchResult
                      key={result.id}
                      patient={result}
                      query={outcome.query}
                      active={selected?.id === result.id}
                      onSelect={setSelected}
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
              patient={selected}
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
}: {
  emoji: string;
  label: string;
  value: number | null;
  loading: boolean;
  accent: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`rounded-[1.5rem] border border-slate-800 bg-gradient-to-br ${accent} px-4 py-4 ring-1 backdrop-blur-sm`}
    >
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
    </motion.div>
  );
}