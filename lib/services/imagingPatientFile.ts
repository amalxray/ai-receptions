/**
 * N30 — ACTIVITY-AWARE PATIENT FILE (pure model).
 *
 * A dental clinic and an imaging center share ONE patient file route
 * (`/dashboard/{slug}/patients/{id}`), but they do not do the same job:
 *
 *   clinic / dental_lab → treatment sessions (🦷) + imaging FILES (🖼️)
 *   imaging_center      → imaging REQUESTS inbox (🩹) + STUDIES (🩻)
 *
 * This module is the single source of that decision, so the tabs, the counters
 * and the tests can never drift apart. It imports NOTHING from React or the
 * server: pages (client), routes (server) and tests share it verbatim.
 *
 * FAIL-SAFE INVARIANT: `activity_type` is the only discriminator and the
 * default answer is ALWAYS the current (dental) behaviour. An unknown, missing
 * or future activity type therefore renders exactly what the product rendered
 * before N30 — imaging-specific surfaces only appear for `imaging_center`.
 * In particular `dental_lab` is deliberately NOT imaging: its dashboard works
 * on `lab_cases`, not on referrals.
 */
import { ACTIVITY_TYPE_LABELS_AR, normalizeActivityType } from './activityTypes';
import { isReferralTerminal } from './referralWorkflow';

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export type PatientFileTabKey =
  | 'overview'
  | 'appointments'
  | 'sessions'
  | 'requests'
  | 'studies'
  | 'files'
  | 'financial'
  | 'communications';

export type PatientFileTab = { key: PatientFileTabKey; label: string };

/** Today's tab set — pinned by tests so clinics cannot drift. */
export const DENTAL_FILE_TABS: readonly PatientFileTab[] = [
  { key: 'overview', label: '📋 نظرة عامة' },
  { key: 'appointments', label: '📅 المواعيد' },
  { key: 'sessions', label: '🦷 الجلسات' },
  { key: 'financial', label: '💰 المالية' },
  { key: 'files', label: '🖼️ ملفات الأشعة' },
  { key: 'communications', label: '🗨️ التواصل' },
] as const;

/**
 * The imaging-center tab set: same order and count as the dental one so the
 * muscle memory survives, with the treatment domain replaced by the referral
 * domain (طلبات الأشعة) and the file domain renamed to what an imaging center
 * actually produces (الدراسات).
 */
export const IMAGING_FILE_TABS: readonly PatientFileTab[] = [
  { key: 'overview', label: '📋 نظرة عامة' },
  { key: 'appointments', label: '📅 المواعيد' },
  { key: 'requests', label: '🩹 طلبات الأشعة' },
  { key: 'financial', label: '💰 المالية' },
  { key: 'studies', label: '🩻 الدراسات' },
  { key: 'communications', label: '🗨️ التواصل' },
] as const;

/** True when the activity works on imaging requests/studies instead of sessions. */
export function isImagingFile(activityType: unknown): boolean {
  return normalizeActivityType(activityType) === 'imaging_center';
}

export function patientFileTabs(activityType: unknown): PatientFileTab[] {
  return [...(isImagingFile(activityType) ? IMAGING_FILE_TABS : DENTAL_FILE_TABS)];
}

export function patientFileTabKeys(activityType: unknown): PatientFileTabKey[] {
  return patientFileTabs(activityType).map((t) => t.key);
}

/** The file/studies tab key of this activity (never hard-code 'files' again). */
export function filesTabKey(activityType: unknown): 'files' | 'studies' {
  return isImagingFile(activityType) ? 'studies' : 'files';
}

/** Where the profile's referral counter should lead this activity. */
export function referralsTabKey(activityType: unknown): 'requests' | null {
  return isImagingFile(activityType) ? 'requests' : null;
}

/**
 * Clamps a tab against the activity's set. Needed because `activity_type` is
 * resolved asynchronously: a deep link (or a clinic switch) can leave the state
 * pointing at a tab this activity does not have (e.g. 'sessions' inside an
 * imaging center). An unknown tab must never render a blank body.
 */
export function resolvePatientFileTab(
  activityType: unknown,
  tab: PatientFileTabKey | string | null | undefined,
): PatientFileTabKey {
  const keys = patientFileTabKeys(activityType);
  return tab && (keys as string[]).includes(tab) ? (tab as PatientFileTabKey) : 'overview';
}

/* -------------------------------------------------------------------------- */
/* Imaging requests (`imaging_requests` row shape used by the patient file)    */
/* -------------------------------------------------------------------------- */

export type ImagingRequestRow = {
  id: string;
  clinic_id: string | null;
  referring_clinic_id: string | null;
  patient_id: string | null;
  patient_id_center: string | null;
  patient_ref: string | null;
  requested_service: string | null;
  service_id: string | null;
  modality: string | null;
  status: string;
  imaging_status: string | null;
  priority: string | null;
  notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

export type ImagingPartner = {
  name: string | null;
  slug: string | null;
  activity_type: string | null;
};

export type ImagingRequestPartners = Record<string, ImagingPartner>;

/**
 * `patient_id` = the REFERRING clinic's patient; `patient_id_center` = the
 * activity tenant's own file created from the referral (see
 * /api/imaging/requests/[requestId]/create-patient). Either link means "this
 * request belongs to this patient", so the tab filters defensively on the
 * client exactly like B48 does for appointments.
 */
export function belongsToPatient(
  row: Pick<ImagingRequestRow, 'patient_id' | 'patient_id_center'>,
  patientId: string | null | undefined,
): boolean {
  if (!patientId) return false;
  return row.patient_id === patientId || row.patient_id_center === patientId;
}

/** The other organization in this referral, from my own point of view. */
export function counterpartyId(
  myClinicId: string | null | undefined,
  row: Pick<ImagingRequestRow, 'clinic_id' | 'referring_clinic_id'>,
): string | null {
  if (row.referring_clinic_id && row.referring_clinic_id !== myClinicId) return row.referring_clinic_id;
  if (row.clinic_id && row.clinic_id !== myClinicId) return row.clinic_id;
  return null;
}

/** Never an empty cell: an unresolved partner still says WHO it is. */
export function counterpartyName(
  myClinicId: string | null | undefined,
  row: Pick<ImagingRequestRow, 'clinic_id' | 'referring_clinic_id' | 'patient_ref'>,
  partners: ImagingRequestPartners = {},
): string {
  const id = counterpartyId(myClinicId, row);
  const partner = id ? partners[id] : undefined;
  const name = partner?.name?.trim();
  if (name) return name;
  return 'جهة خارجية غير معروفة';
}

export function counterpartyActivityLabel(
  myClinicId: string | null | undefined,
  row: Pick<ImagingRequestRow, 'clinic_id' | 'referring_clinic_id'>,
  partners: ImagingRequestPartners = {},
): string {
  const id = counterpartyId(myClinicId, row);
  const type = id ? partners[id]?.activity_type : null;
  return ACTIVITY_TYPE_LABELS_AR[normalizeActivityType(type)];
}

/* -------------------------------------------------------------------------- */
/* Periods — «اليوم / هذا الأسبوع / هذا الشهر / أقدم»                          */
/* -------------------------------------------------------------------------- */

export type ImagingRequestPeriod = 'today' | 'week' | 'month' | 'older' | 'undated';

/** Canonical display order (newest bucket first, undated last). */
export const IMAGING_PERIOD_ORDER: readonly ImagingRequestPeriod[] = [
  'today',
  'week',
  'month',
  'older',
  'undated',
] as const;

export const IMAGING_PERIOD_LABELS_AR: Record<ImagingRequestPeriod, string> = {
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  older: 'أقدم',
  undated: 'بدون تاريخ',
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calendar buckets (not rolling windows): «هذا الأسبوع» starts on Sunday and
 * «هذا الشهر» on the 1st, which is what staff mean when they filter. A future
 * timestamp (clock skew) is treated as today rather than vanishing.
 */
export function imagingRequestPeriod(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): ImagingRequestPeriod {
  if (!createdAt) return 'undated';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'undated';
  const dayStart = startOfLocalDay(now);
  if (d >= dayStart) return 'today';
  const weekStart = startOfLocalDay(dayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  if (d >= weekStart) return 'week';
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (d >= monthStart) return 'month';
  return 'older';
}

/** Non-empty buckets, in display order, newest row first inside each bucket. */
export function groupImagingRequestsByPeriod<T extends { created_at: string | null }>(
  rows: readonly T[],
  now: Date = new Date(),
): { period: ImagingRequestPeriod; rows: T[] }[] {
  const buckets = new Map<ImagingRequestPeriod, T[]>();
  for (const row of rows) {
    const period = imagingRequestPeriod(row.created_at, now);
    const bucket = buckets.get(period);
    if (bucket) bucket.push(row);
    else buckets.set(period, [row]);
  }
  return IMAGING_PERIOD_ORDER.filter((p) => buckets.has(p)).map((period) => ({
    period,
    rows: [...(buckets.get(period) ?? [])].sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    ),
  }));
}

/** Header subtitle of the patient file, per activity. */
export function patientFileScopeLabel(activityType: unknown): string {
  const type = normalizeActivityType(activityType);
  return ACTIVITY_TYPE_LABELS_AR[type];
}

/* -------------------------------------------------------------------------- */
/* Status roll-up + filters                                                    */
/* -------------------------------------------------------------------------- */

export type ImagingRequestSummary = {
  total: number;
  active: number;
  urgent: number;
  done: number;
};

/** `done` mirrors the shared terminal-state rule (never a second opinion). */
export function summarizeImagingRequests(
  rows: readonly Pick<ImagingRequestRow, 'status' | 'priority'>[],
): ImagingRequestSummary {
  let active = 0;
  let urgent = 0;
  let done = 0;
  for (const row of rows) {
    if (isReferralTerminal(row.status)) done += 1;
    else active += 1;
    if (row.priority === 'urgent' && !isReferralTerminal(row.status)) urgent += 1;
  }
  return { total: rows.length, active, urgent, done };
}

export type ImagingRequestStatusFilter = 'all' | 'active' | 'done';

export function filterImagingRequests<T extends Pick<ImagingRequestRow, 'status'>>(
  rows: readonly T[],
  filter: ImagingRequestStatusFilter,
): T[] {
  if (filter === 'all') return [...rows];
  const wantDone = filter === 'done';
  return rows.filter((row) => isReferralTerminal(row.status) === wantDone);
}

/** The most meaningful timestamp of a request, with its Arabic label. */
export function imagingRequestTimestamp(
  row: Pick<ImagingRequestRow, 'completed_at' | 'scheduled_at' | 'created_at'>,
): { label: string; value: string | null } {
  if (row.completed_at) return { label: 'اكتمل في', value: row.completed_at };
  if (row.scheduled_at) return { label: 'مجدول في', value: row.scheduled_at };
  return { label: 'أُنشئ في', value: row.created_at };
}

