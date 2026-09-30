/**
 * N15 — Smart Patient Profile: pure, framework-free domain logic.
 *
 * Everything that decides WHAT the profile shows (metadata parsing, completion
 * score, message bodies, balance math, night mode, search) lives here so it can
 * be unit-tested without React. The component only renders.
 *
 * Persistence contract (NO migration): every extra field lives inside the
 * existing `patients.metadata` jsonb under a stable group:
 *   basic_info | medical_history | insurance | emergency_contact | quick_notes
 *
 * N15.1: the age is typed MANUALLY (`age`, in years) and stored both flat and
 * inside `basic_info`; `date_of_birth` stays readable for legacy records only.
 */

import { calculatePatientAge, formatAgeAr } from '@/lib/patientAge';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type SmartPatientData = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
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
  /**
   * Derived from the medical history (allergy + chronic + surgery entries).
   * Optional: callers without a medical history leave it out and the component
   * computes it from `metadata`.
   */
  alertsCount?: number;
};

export type SmartPatientBalance = {
  invoiced: number;
  paid: number;
  due: number;
};

/** Every node the journey line can draw (N27 added the 🦷 treatment session). */
export type SmartTimelineIconType =
  | 'visit'
  | 'file'
  | 'referral'
  | 'invoice'
  | 'note'
  | 'medical'
  | 'session';

export type SmartTimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  time?: string;
  status: 'completed' | 'in_progress' | 'remaining' | 'cancelled';
  iconType?: SmartTimelineIconType;
  /**
   * N27 — session events only: the procedure name. Drives the same colour
   * palette the 🦷 cards use (`sessionProcedureTone`).
   */
  procedure?: string;
  /** N27 — session events only: the raw plan state, so the badge can be Arabic. */
  sessionStatus?: PatientSessionStatus;
};

export type QuickNote = {
  /** Free text exactly as the doctor typed it. */
  text: string;
  /** ISO timestamp — the timeline orders notes by this. */
  date: string;
  /** Author label (user email / role when known). */
  by?: string;
};

/** N26 — the only three states a treatment session can be in. */
export const PATIENT_SESSION_STATUSES = ['done', 'planned', 'cancelled'] as const;
export type PatientSessionStatus = (typeof PATIENT_SESSION_STATUSES)[number];

export const PATIENT_TREATMENT_TYPES = ['حشوة', 'عصب', 'خلع', 'تلبيس', 'تنظيف', 'تقويم', 'زراعة', 'أخرى'] as const;
export type PatientTreatmentType = (typeof PATIENT_TREATMENT_TYPES)[number];

/**
 * N26 — one item of the dental treatment plan, stored in
 * `patients.metadata.sessions` (no migration: the patient row already owns the
 * JSONB). `id` is optional on input — legacy / hand-written entries have none —
 * and is always synthesised while parsing, so the UI can key, patch and colour a
 * session without a database column.
 */
export type PatientSession = {
  id: string;
  /** YYYY-MM-DD — the day the session took place (or is planned for). */
  date: string;
  service: string;
  /** Free tooth notation ("36", "الفك الأيسر") — never coerced to a number. */
  tooth?: string;
  /** N33 — dental treatment type kept in the same metadata JSONB bucket. */
  treatment_type?: PatientTreatmentType;
  /** N33 — the doctor who owns the plan step, selected from clinic providers. */
  doctor_id?: string | null;
  /** N33 — next planned session / follow-up note. */
  next_plan?: string;
  status: PatientSessionStatus;
  note?: string;
};

/** What the modal collects; the id is assigned when the session is appended. */
export type PatientSessionDraft = Omit<PatientSession, 'id'> & { id?: string };

export const PATIENT_TREATMENT_STATUSES = ['active', 'closed'] as const;
export type PatientTreatmentStatus = (typeof PATIENT_TREATMENT_STATUSES)[number];

export function normalizePatientTreatmentStatus(value: unknown): PatientTreatmentStatus {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'open') return 'active';
  if (raw === 'closed') return 'closed';
  return raw === 'active' ? 'active' : 'active';
}

export type PatientTreatmentEpisode = {
  id: string;
  started_at: string;
  opened_at?: string | null;
  status: PatientTreatmentStatus;
  closed_at?: string | null;
  reason?: string | null;
  note?: string | null;
};

export type MedicalHistory = {
  allergies: string[];
  medications: string[];
  chronic: string[];
  surgeries: string[];
  /** '', 'yes', 'no', 'ex' — kept as free labels, never coerced to booleans. */
  smoking: string;
  alcohol: string;
  pregnancy: string;
};

export type InsuranceInfo = {
  provider: string;
  card_number: string;
  coverage: string;
  expiry: string;
};

export type EmergencyContact = {
  name: string;
  phone: string;
  relation: string;
};

export type PatientGender = 'male' | 'female' | 'mr' | 'mrs' | '';

export const PATIENT_GENDERS: PatientGender[] = ['male', 'female', 'mr', 'mrs', ''];

export function normalizePatientGender(value: unknown): PatientGender {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return '';
  if (raw === 'male' || raw === 'ذكر') return 'male';
  if (raw === 'female' || raw === 'أنثى') return 'female';
  if (raw === 'mr' || raw === 'مَرْ' || raw === 'السيد' || raw === 'سيد') return 'mr';
  if (raw === 'mrs' || raw === 'السيدة' || raw === 'سيدة') return 'mrs';
  return raw === 'man' || raw === 'm' ? 'male' : raw === 'woman' || raw === 'f' ? 'female' : '';
}

export function patientGenderLabel(value: unknown): string {
  switch (normalizePatientGender(value)) {
    case 'male':
      return 'ذكر';
    case 'female':
      return 'أنثى';
    case 'mr':
      return 'سيد';
    case 'mrs':
      return 'سيدة';
    default:
      return 'غير محدد';
  }
}

export function patientGenderAvatar(value: unknown): { icon: string; gradient: string; tone: string; badge: string } {
  switch (normalizePatientGender(value)) {
    case 'male':
      return { icon: '👨', gradient: 'from-cyan-500 to-blue-600', tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200', badge: 'ذكر' };
    case 'female':
      return { icon: '👩', gradient: 'from-pink-500 to-rose-600', tone: 'bg-pink-100 text-pink-800 ring-pink-200', badge: 'أنثى' };
    case 'mr':
      return { icon: '🧔', gradient: 'from-slate-500 to-slate-700', tone: 'bg-slate-100 text-slate-800 ring-slate-200', badge: 'سيد' };
    case 'mrs':
      return { icon: '👩‍🦰', gradient: 'from-rose-400 to-violet-600', tone: 'bg-violet-100 text-violet-800 ring-violet-200', badge: 'سيدة' };
    default:
      return { icon: '👤', gradient: 'from-cyan-500 to-blue-600', tone: 'bg-slate-100 text-slate-700 ring-slate-200', badge: 'غير محدد' };
  }
}

export type BasicInfo = {
  age: string;
  gender: string;
  blood_type: string;
  address: string;
};

export type SmartPatientMetadata = {
  /**
   * N15.1 — manual age in YEARS as typed by the doctor ("35"). `''` = unknown.
   * Mirrored inside `basic_info.age` so both readers stay happy.
   */
  age: string;
  /**
   * Legacy source only: records created before N15.1 stored a birth date and
   * the age was derived from it. New patients leave it empty.
   */
  date_of_birth: string;
  basic_info: BasicInfo;
  medical_history: MedicalHistory;
  insurance: InsuranceInfo;
  emergency_contact: EmergencyContact;
  quick_notes: QuickNote[];
  /** N26 — the dental treatment plan (done / planned / cancelled sessions). */
  sessions: PatientSession[];
  /** N21 — patient treatment lifecycle history kept in metadata without a migration. */
  episodes: PatientTreatmentEpisode[];
  /** N21 — current active episode reference, kept in metadata so the UI can reopen/close without a schema change. */
  current_episode_id: string | null;
  /** Anything the rest of the app already stores (source, status, alerts…). */
  [key: string]: unknown;
};

/* ------------------------------------------------------------------ */
/* Metadata parse / merge                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** Tolerant list reader: accepts real arrays, comma/newline strings, or junk. */
export function asStringArray(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,،\n]/) : [];
  return raw
    .map((item) => asString(item).trim())
    .filter((item) => item.length > 0)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

/** Editor → metadata: "حساسية البنسلين، غبار" becomes two tags. */
export function parseStringList(value: string): string[] {
  return asStringArray(value);
}

/** Metadata → editor: tags become one editable, comma-separated line. */
export function formatStringList(list: readonly string[]): string {
  return list.join('، ');
}

export function normalizeTreatmentEpisode(raw: unknown, fallbackIndex = 0): PatientTreatmentEpisode | null {
  if (!raw || typeof raw !== 'object') return null;
  const episode = raw as Record<string, unknown>;
  const status = normalizePatientTreatmentStatus(episode.status);
  const startedAt = asString(episode.started_at || episode.startedAt || episode.opened_at || episode.openedAt) || new Date().toISOString();

  return {
    id: asString(episode.id) || `episode-${fallbackIndex + 1}`,
    started_at: startedAt,
    opened_at: startedAt,
    status,
    closed_at: typeof episode.closed_at === 'string' || typeof episode.closedAt === 'string' ? asString(episode.closed_at || episode.closedAt) : null,
    reason: typeof episode.reason === 'string' ? episode.reason : null,
    note: typeof episode.note === 'string' ? episode.note : null,
  };
}

export function getPatientTreatmentEpisodes(metadata: unknown): PatientTreatmentEpisode[] {
  const source = isRecord(metadata) ? metadata : {};
  const candidate = Array.isArray(source.episodes)
    ? source.episodes
    : Array.isArray(source.treatment_episodes)
      ? source.treatment_episodes
      : [];

  return candidate
    .map((episode, index) => normalizeTreatmentEpisode(episode, index))
    .filter((episode): episode is PatientTreatmentEpisode => Boolean(episode));
}

export function getCurrentPatientTreatmentEpisode(metadata: unknown): PatientTreatmentEpisode | null {
  const source = isRecord(metadata) ? metadata : {};
  const episodes = getPatientTreatmentEpisodes(metadata);
  const currentId = asString(source.current_episode_id ?? source.currentEpisodeId);
  if (currentId) {
    const byId = episodes.find((episode) => episode.id === currentId);
    if (byId) return byId;
  }
  const activeEpisode = [...episodes].reverse().find((episode) => episode.status === 'active');
  return activeEpisode ?? episodes[episodes.length - 1] ?? null;
}

export function getPatientTreatmentStatus(metadata: unknown): PatientTreatmentStatus {
  return getCurrentPatientTreatmentEpisode(metadata)?.status ?? 'active';
}

export function patientTreatmentStatusLabel(metadata: unknown): 'نشط' | 'منتهي' {
  return getPatientTreatmentStatus(metadata) === 'closed' ? 'منتهي' : 'نشط';
}

export function getPatientOutstandingDebt(metadata: unknown): number {
  const source = isRecord(metadata) ? metadata : {};
  const balance = isRecord(source.balance) ? (source.balance as Record<string, unknown>) : {};
  const financial = isRecord(source.financial) ? (source.financial as Record<string, unknown>) : {};
  const candidates = [
    source.balance_due,
    source.debt_due,
    source.outstanding_amount,
    source.outstanding,
    source.account_balance,
    source.current_balance,
    balance.due,
    balance.outstanding,
    financial.outstanding,
    financial.balance_due,
  ];

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (isRecord(value)) {
      const record = value as Record<string, unknown>;
      return toNumber(record.amount ?? record.total ?? record.due ?? record.outstanding ?? record.balance_due);
    }
    return 0;
  };

  return candidates.reduce<number>((sum, value) => sum + toNumber(value), 0);
}

export function canClosePatientTreatment(metadata: unknown): boolean {
  return getPatientOutstandingDebt(metadata) <= 0;
}

function generateEpisodeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `episode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function closePatientTreatment(
  metadata: unknown,
  options?: { reason?: string; note?: string; closedAt?: string; allowDebtOverride?: boolean }
): SmartPatientMetadata {
  const base = parsePatientMetadata(metadata);
  const nextEpisodes = [...base.episodes];
  const current = getCurrentPatientTreatmentEpisode(base);
  const closedAt = options?.closedAt ?? new Date().toISOString();

  if (!options?.allowDebtOverride && !canClosePatientTreatment(base)) {
    return { ...base, episodes: nextEpisodes, current_episode_id: current?.id ?? base.current_episode_id ?? null };
  }

  const target = current && current.status !== 'closed' ? current : nextEpisodes.find((episode) => episode.status !== 'closed') ?? null;
  if (target) {
    const closed: PatientTreatmentEpisode = {
      ...target,
      started_at: target.started_at || closedAt,
      opened_at: target.opened_at ?? target.started_at ?? closedAt,
      status: 'closed',
      closed_at: closedAt,
      reason: options?.reason ?? target.reason ?? null,
      note: options?.note ?? target.note ?? null,
    };
    const idx = nextEpisodes.findIndex((episode) => episode.id === target.id);
    if (idx >= 0) nextEpisodes[idx] = closed;
    else nextEpisodes.push(closed);
  } else if (nextEpisodes.length === 0) {
    nextEpisodes.push({
      id: generateEpisodeId(),
      started_at: closedAt,
      opened_at: closedAt,
      status: 'closed',
      closed_at: closedAt,
      reason: options?.reason ?? null,
      note: options?.note ?? null,
    });
  }

  return { ...base, episodes: nextEpisodes, current_episode_id: null };
}

export function reopenPatientTreatment(metadata: unknown, options?: { note?: string; openedAt?: string }): SmartPatientMetadata {
  const base = parsePatientMetadata(metadata);
  const nextEpisodes = [...base.episodes];
  const current = getCurrentPatientTreatmentEpisode(base);
  const openedAt = options?.openedAt ?? new Date().toISOString();

  if (current && current.status === 'active') return { ...base, episodes: nextEpisodes, current_episode_id: current.id };

  const nextEpisode: PatientTreatmentEpisode = {
    id: generateEpisodeId(),
    started_at: openedAt,
    opened_at: openedAt,
    status: 'active',
    closed_at: null,
    reason: null,
    note: options?.note ?? null,
  };
  nextEpisodes.push(nextEpisode);

  return { ...base, episodes: nextEpisodes, current_episode_id: nextEpisode.id };
}

/** Reads `patients.metadata` defensively — never throws on malformed shapes. */
export function parsePatientMetadata(metadata: unknown): SmartPatientMetadata {
  const source = isRecord(metadata) ? metadata : {};

  const medical = isRecord(source.medical_history) ? source.medical_history : {};
  const insurance = isRecord(source.insurance) ? source.insurance : {};
  const emergency = isRecord(source.emergency_contact) ? source.emergency_contact : {};
  const basic = isRecord(source.basic_info) ? source.basic_info : {};

  // N15 — legacy rows stored allergies / smoking / blood_type / provider at the
  // TOP level of the JSONB. Read both shapes so opening an old patient never
  // loses history; a nested value always wins over its flat duplicate.
  const pickScalar = (nested: unknown, flat: unknown): string => asString(nested) || asString(flat);
  const pickList = (nested: unknown, flat: unknown): string[] => {
    const nestedList = asStringArray(nested);
    return nestedList.length > 0 ? nestedList : asStringArray(flat);
  };

  const notes: QuickNote[] = Array.isArray(source.quick_notes)
    ? source.quick_notes
        .map((entry) => {
          if (typeof entry === 'string') return { text: entry, date: '' };
          if (isRecord(entry)) {
            return {
              text: asString(entry.text),
              date: asString(entry.date),
              ...(asString(entry.by) ? { by: asString(entry.by) } : {}),
            };
          }
          return null;
        })
        .filter((entry): entry is QuickNote => Boolean(entry && entry.text.trim()))
    : [];

  const episodeSource = Array.isArray(source.episodes)
    ? source.episodes
    : Array.isArray(source.treatment_episodes)
      ? source.treatment_episodes
      : [];

  const episodes = episodeSource
    .map((episode, index) => normalizeTreatmentEpisode(episode, index))
    .filter((episode): episode is PatientTreatmentEpisode => Boolean(episode));

  const normalizedCurrentEpisodeId = asString(source.current_episode_id ?? source.currentEpisodeId) || null;

  return {
    ...source,
    // N15.1 — the manual age is read flat (`age`) or nested (`basic_info.age`).
    age: pickScalar(basic.age, source.age),
    date_of_birth: asString(source.date_of_birth) || asString(basic.date_of_birth),
    basic_info: {
      age: pickScalar(basic.age, source.age),
      gender: pickScalar(basic.gender, source.gender),
      blood_type: pickScalar(basic.blood_type, source.blood_type),
      address: pickScalar(basic.address, source.address),
    },
    medical_history: {
      allergies: pickList(medical.allergies, source.allergies),
      medications: pickList(medical.medications, source.medications),
      chronic: pickList(medical.chronic, source.chronic),
      surgeries: pickList(medical.surgeries, source.surgeries),
      smoking: pickScalar(medical.smoking, source.smoking),
      alcohol: pickScalar(medical.alcohol, source.alcohol),
      pregnancy: pickScalar(medical.pregnancy, source.pregnancy),
    },
    insurance: {
      provider: pickScalar(insurance.provider, source.provider),
      card_number: pickScalar(insurance.card_number, source.card_number),
      coverage: pickScalar(insurance.coverage, source.coverage),
      expiry: pickScalar(insurance.expiry, source.expiry),
    },
    emergency_contact: {
      name: pickScalar(emergency.name, source.emergency_contact_name),
      phone: pickScalar(emergency.phone, source.emergency_contact_phone),
      relation: pickScalar(emergency.relation, source.emergency_contact_relation),
    },
    quick_notes: notes,
    sessions: parsePatientSessions(source.sessions),
    episodes,
    current_episode_id: normalizedCurrentEpisodeId,
  };
}

/**
 * Shallow-merges a patch into the CURRENT metadata while deep-merging the four
 * object groups — so saving a blood type can never wipe insurance or notes.
 */
export function mergeMetadataPatch(
  current: unknown,
  patch: Partial<SmartPatientMetadata>
): SmartPatientMetadata {
  const base = parsePatientMetadata(current);
  const next: SmartPatientMetadata = { ...base, ...patch };

  const groups = ['basic_info', 'medical_history', 'insurance', 'emergency_contact'] as const;
  for (const key of groups) {
    const incoming = patch[key];
    if (isRecord(incoming)) {
      next[key] = { ...(base[key] as Record<string, unknown>), ...incoming } as never;
    }
  }

  if (!Array.isArray(patch.quick_notes)) next.quick_notes = base.quick_notes;
  if (patch.current_episode_id !== undefined) next.current_episode_id = patch.current_episode_id ?? null;
  return next;
}

/** The four nested groups + the two flat keys serializePatientMetadata owns. */
const GROUP_KEYS = ['basic_info', 'medical_history', 'insurance', 'emergency_contact'] as const;

/**
 * Metadata → JSONB payload for `patients.metadata` (NO migration needed).
 *
 * Clean JSONB: empty strings / empty arrays / empty groups are dropped, while
 * `date_of_birth` is ALSO written at the top level so the flat legacy readers
 * (intake forms, imports) keep working. Keys the rest of the app already stores
 * (`critical_alert`, `alerts`, `source`, …) are preserved untouched.
 */
/**
 * Result of {@link serializePatientMetadata}: the JSONB payload written back to
 * `patients.metadata`. Only groups that actually hold data are emitted, so each
 * group is optional at the type level (mirroring the runtime), while any custom
 * key already stored by other features survives the round-trip untouched.
 */
export type SerializedPatientMetadata = {
  /** N15.1 — manual age written flat so flat readers find it without nesting. */
  age?: string;
  date_of_birth?: string;
  basic_info?: Partial<BasicInfo>;
  medical_history?: Partial<MedicalHistory>;
  insurance?: Partial<InsuranceInfo>;
  emergency_contact?: Partial<EmergencyContact>;
  quick_notes?: QuickNote[];
  /** N26 — the normalised treatment plan. */
  sessions?: PatientSession[];
  /** N21 — patient treatment lifecycle without DB migration. */
  episodes?: PatientTreatmentEpisode[];
  current_episode_id?: string | null;
  /** Any custom key already stored by other features survives the round-trip. */
  [key: string]: unknown;
};

export function serializePatientMetadata(metadata: unknown): SerializedPatientMetadata {
  const meta = parsePatientMetadata(metadata);
  const out: Record<string, unknown> = {};

  const owned = new Set<string>([...GROUP_KEYS, 'age', 'date_of_birth', 'quick_notes', 'sessions', 'episodes']);
  for (const [key, value] of Object.entries(meta)) {
    if (owned.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }

  const dateOfBirth = meta.date_of_birth.trim();
  if (dateOfBirth) out.date_of_birth = dateOfBirth;

  const manualAge = meta.age.trim();
  if (manualAge) out.age = manualAge;

  const basic = Object.entries(meta.basic_info).filter(([, v]) => asString(v).trim()) as [string, string][];
  if (basic.length) out.basic_info = Object.fromEntries(basic.map(([k, v]) => [k, v.trim()]));

  const medical = meta.medical_history;
  const medicalOut: Record<string, unknown> = {
    allergies: medical.allergies,
    medications: medical.medications,
    chronic: medical.chronic,
    surgeries: medical.surgeries,
    smoking: medical.smoking.trim(),
    alcohol: medical.alcohol.trim(),
    pregnancy: medical.pregnancy.trim(),
  };
  const compactMedical = Object.fromEntries(
    Object.entries(medicalOut).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
  );
  if (Object.keys(compactMedical).length) out.medical_history = compactMedical;

  const insurance = Object.entries(meta.insurance).filter(([, v]) => asString(v).trim()) as [string, string][];
  if (insurance.length) out.insurance = Object.fromEntries(insurance.map(([k, v]) => [k, v.trim()]));

  const emergency = Object.entries(meta.emergency_contact).filter(([, v]) => asString(v).trim()) as [string, string][];
  if (emergency.length) out.emergency_contact = Object.fromEntries(emergency.map(([k, v]) => [k, v.trim()]));

  const notes = meta.quick_notes.filter((note) => note.text.trim());
  if (notes.length) out.quick_notes = notes;

  // N26 — the plan is written back normalised and bounded, never as raw input.
  const sessions = meta.sessions.filter((session) => session.service.trim());
  if (sessions.length) out.sessions = sessions;

  const episodes = meta.episodes.filter((episode) => episode.id.trim());
  if (episodes.length) out.episodes = episodes;

  const currentEpisodeId = asString(meta.current_episode_id).trim();
  if (currentEpisodeId) out.current_episode_id = currentEpisodeId;
  else if ('current_episode_id' in meta && meta.current_episode_id === null) out.current_episode_id = null;

  return out;
}

/** Healthy default for a patient with no metadata yet. */
export function emptyMetadata(): SmartPatientMetadata {
  return {
    age: '',
    date_of_birth: '',
    basic_info: { age: '', gender: '', blood_type: '', address: '' },
    medical_history: {
      allergies: [],
      medications: [],
      chronic: [],
      surgeries: [],
      smoking: '',
      alcohol: '',
      pregnancy: '',
    },
    insurance: { provider: '', card_number: '', coverage: '', expiry: '' },
    emergency_contact: { name: '', phone: '', relation: '' },
    quick_notes: [],
    sessions: [],
    episodes: [],
    current_episode_id: null,
  };
}

/* ------------------------------------------------------------------ */
/* N15.1 — العمر اليدوي (Manual age)                                   */
/* ------------------------------------------------------------------ */

/**
 * Upper bound for a hand-typed age — mirrors `isValidDateOfBirth`'s 130-year
 * ceiling in `lib/patientAge` so both entry paths reject the same junk.
 */
export const MAX_PATIENT_AGE = 130;

/**
 * "35" | 35 | " 35 " → 35. Anything else (empty, negative, decimals, letters,
 * or more than {@link MAX_PATIENT_AGE} years) → null.
 */
export function parseManualAge(value: unknown): number | null {
  const raw = (typeof value === 'number' ? String(value) : asString(value)).trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const years = Number(raw);
  return years <= MAX_PATIENT_AGE ? years : null;
}

/**
 * Patient-form validation for the manual age field: BLANK is accepted (the
 * field is optional and clearing it removes the age), otherwise the value must
 * be a whole number of years between 0 and {@link MAX_PATIENT_AGE}.
 */
export function isValidManualAge(value: unknown): boolean {
  const raw = (typeof value === 'number' ? String(value) : asString(value)).trim();
  return raw === '' || parseManualAge(raw) !== null;
}

/**
 * Manual years → Arabic label ("35 سنة"، "سنة واحدة"، "سنتان"). A `0` means the
 * doctor only gave years, so "أقل من سنة" is the honest label.
 */
export function formatManualAgeAr(value: unknown): string {
  const years = parseManualAge(value);
  if (years === null) return 'غير محدد';
  if (years === 0) return 'أقل من سنة';
  return formatAgeAr({ years, months: 0, days: 0 });
}

/** The manual age stored on the record (flat `age` or `basic_info.age`). */
export function readManualAge(metadata: unknown): string {
  return parsePatientMetadata(metadata).age.trim();
}

/**
 * N15.1 — what the patient file shows: the MANUAL age first, and only when it
 * is missing do we fall back to deriving the age from a legacy
 * `date_of_birth`. Returns "غير محدد" when neither is available.
 */
export function resolvePatientAgeLabel(metadata: unknown): string {
  const meta = parsePatientMetadata(metadata);
  if (parseManualAge(meta.age) !== null) return formatManualAgeAr(meta.age);
  return formatAgeAr(calculatePatientAge(meta.date_of_birth));
}

/* ------------------------------------------------------------------ */
/* Completion ring + alerts                                            */

/* ------------------------------------------------------------------ */
/* Completion ring + alerts                                            */
/* ------------------------------------------------------------------ */

/** The 7 weighted checks behind the Status Ring. Each check is worth 1 point. */
export function profileCompleteness(
  metadata: SmartPatientMetadata,
  patient: Pick<SmartPatientData, 'phone' | 'email'>
): { score: number; missing: string[] } {
  const medical = metadata.medical_history;
  const checks: { ok: boolean; label: string }[] = [
    // N15.1 — a hand-typed age counts, and a legacy birth date still counts too.
    { ok: Boolean(metadata.age.trim() || metadata.date_of_birth), label: 'العمر' },
    { ok: Boolean(metadata.basic_info.blood_type), label: 'فصيلة الدم' },
    { ok: Boolean(metadata.basic_info.gender), label: 'الجنس' },
    { ok: Boolean(patient.phone), label: 'الهاتف' },
    { ok: Boolean(patient.email), label: 'البريد' },
    { ok: medical.allergies.length > 0 || medical.chronic.length > 0, label: 'التاريخ الطبي' },
    {
      ok: Boolean(metadata.emergency_contact.name && metadata.emergency_contact.phone),
      label: 'جهة اتصال الطوارئ',
    },
  ];
  const done = checks.filter((c) => c.ok).length;
  return {
    score: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}

/** Alerts card = every clinically dangerous entry the doctor must see. */
export function countMedicalAlerts(medical: MedicalHistory): number {
  return medical.allergies.length + medical.chronic.length + medical.surgeries.length;
}

export type CriticalAlertBadge = {
  text: string;
  tone: 'danger' | 'warn' | 'info';
};

export type CriticalAlerts = {
  /** Free-text red-flag line stored on the record (may be empty). */
  criticalAlert: string;
  /** Everything the header must shout about: allergies, pregnancy, explicit alerts. */
  badges: CriticalAlertBadge[];
};

/**
 * The Status-Ring score (0 → 100) plus the labels still missing.
 *
 * Ten equally-weighted checks: identity (name / phone / email), the medical
 * basics the doctor needs before prescribing, and the emergency contact. A
 * brand-new record with only a name scores 10 — never 0, never "complete".
 */
export function calculateProfileCompletion(
  patient: Partial<SmartPatientData> & Pick<SmartPatientData, 'name'>
): { percent: number; score: number; missing: string[] } {
  const metadata = parsePatientMetadata(patient.metadata);
  const medical = metadata.medical_history;

  const checks: { ok: boolean; label: string }[] = [
    { ok: Boolean(patient.name?.trim()), label: 'الاسم' },
    { ok: Boolean(patient.phone), label: 'الهاتف' },
    { ok: Boolean(patient.email), label: 'البريد' },
    // N15.1 — the manual age replaces the birth date as the age source.
    { ok: Boolean(metadata.age.trim() || metadata.date_of_birth), label: 'العمر' },
    { ok: Boolean(metadata.basic_info.blood_type), label: 'فصيلة الدم' },
    { ok: Boolean(metadata.basic_info.gender), label: 'الجنس' },
    { ok: Boolean(metadata.basic_info.address), label: 'العنوان' },
    {
      ok:
        medical.allergies.length > 0 ||
        medical.chronic.length > 0 ||
        medical.medications.length > 0 ||
        medical.surgeries.length > 0,
      label: 'التاريخ الطبي',
    },
    { ok: Boolean(metadata.insurance.provider || metadata.insurance.card_number), label: 'التأمين' },
    {
      ok: Boolean(metadata.emergency_contact.name && metadata.emergency_contact.phone),
      label: 'جهة اتصال الطوارئ',
    },
  ];

  const done = checks.filter((c) => c.ok).length;
  const percent = Math.round((done / checks.length) * 100);
  return { percent, score: percent, missing: checks.filter((c) => !c.ok).map((c) => c.label) };
}

/**
 * Everything the header alerts strip shows. Explicit `alerts` (array) and
 * `critical_alert` (string) are honoured, then the medical history is mined:
 * allergies, chronic conditions, surgeries and an active pregnancy.
 */
export function deriveCriticalAlerts(
  patient: Pick<SmartPatientData, 'metadata'>
): CriticalAlerts {
  const metadata = parsePatientMetadata(patient.metadata);
  const medical = metadata.medical_history;

  const explicit = asStringArray(metadata.alerts);
  const badges: CriticalAlertBadge[] = [
    ...explicit.map((text) => ({ text, tone: 'danger' as const })),
    ...medical.allergies.map((allergy) => ({ text: `حساسية: ${allergy}`, tone: 'danger' as const })),
    ...medical.chronic.map((condition) => ({ text: `مزمن: ${condition}`, tone: 'warn' as const })),
    ...medical.surgeries.map((surgery) => ({ text: `عملية: ${surgery}`, tone: 'info' as const })),
  ];

  if (medical.pregnancy && medical.pregnancy !== 'لا' && medical.pregnancy !== 'غير مطبّق') {
    badges.push({ text: 'حامل 🤰', tone: 'danger' });
  }

  return { criticalAlert: asString(metadata.critical_alert), badges };
}


/* ------------------------------------------------------------------ */
/* Phone / WhatsApp / money / night mode                               */
/* ------------------------------------------------------------------ */

/**
 * Converts a human phone into wa.me digits. Defaults to Palestine (+970):
 * every clinic in this deployment is Palestinian and local numbers are written
 * 05XXXXXXXX — wa.me rejects the leading 0, so `0599123456` MUST become
 * `970599123456` or the chat button opens an invalid link (B38).
 * Returns null when the number is undialable.
 */
export function normalizePhoneForWhatsApp(
  phone?: string | null,
  defaultCountryCode = '970'
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+')) {
    const clean = digits.slice(1);
    return clean.length >= 8 ? clean : null;
  }
  if (digits.startsWith('00')) {
    const clean = digits.slice(2);
    return clean.length >= 8 ? clean : null;
  }
  if (digits.startsWith('0')) {
    const clean = `${defaultCountryCode}${digits.replace(/^0+/, '')}`;
    return clean.length >= 10 ? clean : null;
  }
  return digits.length >= 8 ? digits : null;
}

/** Builds a real https://wa.me deep link (null when the phone is unusable). */
export function buildWhatsAppHref(phone: string | null | undefined, message: string): string | null {
  const target = normalizePhoneForWhatsApp(phone);
  if (!target) return null;
  const text = message.trim();
  return text ? `https://wa.me/${target}?text=${encodeURIComponent(text)}` : `https://wa.me/${target}`;
}

/** Money label: thousands-grouped, integer when whole, 2 decimals otherwise. */
export function formatMoneyAr(value: number, currency = 'د.أ'): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 100) / 100;
  const body = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${body} ${currency}`;
}

/**
 * Aggregates balance rows. Accepts the shapes returned by
 * /api/clinic/accounting/balances (invoice_balances view) where `balance_due`
 * may be null after a full payment.
 */
export function sumBalanceRows(
  rows: Array<Record<string, unknown>> | null | undefined
): SmartPatientBalance {
  const list = Array.isArray(rows) ? rows : [];
  const num = (value: unknown): number => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };
  return list.reduce<SmartPatientBalance>(
    (acc, row) => ({
      invoiced: acc.invoiced + num(row.invoiced_total ?? row.total),
      paid: acc.paid + num(row.paid_total ?? row.paid_amount),
      due: acc.due + num(row.balance_due ?? row.outstanding_amount),
    }),
    { invoiced: 0, paid: 0, due: 0 }
  );
}

/** Dark mode is automatic after 6 PM (and before 6 AM) — no user toggle. */
export function isNightHour(date: Date = new Date(), fromHour = 18, toHour = 6): boolean {
  const hour = date.getHours();
  return hour >= fromHour || hour < toHour;
}

/**
 * The exact N15 dark-mode trigger: "بعد 6 مساءً" means 18:00 today onwards.
 * Distinct from `isNightHour` (the 18:00 → 06:00 span) so the early-morning
 * hours stay on the light theme.
 */
export function isAfter6Pm(date: Date = new Date()): boolean {
  return date.getHours() >= 18;
}

/** Communication channels the reminder card offers. */
export const REMINDER_CHANNELS = ['whatsapp', 'sms', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const CHANNEL_AR: Record<ReminderChannel, string> = {
  whatsapp: 'واتساب',
  sms: 'SMS',
  email: 'بريد',
};


/* ------------------------------------------------------------------ */
/* Message bodies                                                      */
/* ------------------------------------------------------------------ */

export function formatDateAr(iso?: string | null): string {
  if (!iso) return 'بدون تاريخ';
  const day = iso.slice(0, 10);
  try {
    return new Date(`${day}T00:00:00`).toLocaleDateString('ar', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return day;
  }
}

/** Reminder card body — sent over WhatsApp directly or queued as SMS/email. */
export function buildReminderMessage(params: {
  patientName: string;
  service?: string | null;
  date?: string | null;
  time?: string | null;
  clinicName?: string | null;
}): string {
  const lines = [`مرحبًا ${params.patientName} 👋`];
  if (params.date) {
    const when = `${formatDateAr(params.date)}${params.time ? ` الساعة ${params.time.slice(0, 5)}` : ''}`;
    lines.push(`تذكير بموعدك${params.service ? ` (${params.service})` : ''} يوم ${when}.`);
  } else {
    lines.push('تذكير بموعدك القادم في العيادة.');
  }
  lines.push('يرجى الحضور قبل الموعد بعشر دقائق، وفي حال التعذّر نرجو إبلاغنا مسبقًا.');
  if (params.clinicName) lines.push(`— ${params.clinicName}`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Timeline + search                                                   */
/* ------------------------------------------------------------------ */

/** Appointment status → timeline status (unknown values stay 'in_progress'). */
export function appointmentTimelineStatus(status: string): SmartTimelineItem['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'no_show') return 'cancelled';
  if (status === 'confirmed' || status === 'scheduled') return 'remaining';
  return 'in_progress';
}

/**
 * N27 — a session state expressed as a timeline state: مكتملة → «تم بنجاح»،
 * ملغاة → «ملغي»، ومخطّطة → «متبقي ومجدول». The Arabic labels doctors type are
 * accepted too, because the reader is `normalizeSessionStatus` itself.
 */
export function sessionTimelineStatus(status: unknown): SmartTimelineItem['status'] {
  const normalized = normalizeSessionStatus(status);
  if (normalized === 'done') return 'completed';
  if (normalized === 'cancelled') return 'cancelled';
  return 'remaining';
}

/**
 * N27 — one timeline event per treatment session (`metadata.sessions`), so the
 * journey line finally shows the dental plan next to visits and notes.
 *
 * The id is prefixed with `session-`, which is what makes «الجلسة تظهر مرة
 * واحدة» enforceable: the merged timeline is de-duplicated by id, so a session
 * that reaches the profile through two paths is still drawn once.
 */
export function buildSessionTimelineItems(
  sessions: readonly PatientSession[] | null | undefined
): SmartTimelineItem[] {
  const plan = Array.isArray(sessions) ? sessions : [];
  return plan.map((session) => {
    const details = [session.tooth ? `السن ${session.tooth}` : '', session.note ?? ''].filter(
      (part) => part.trim().length > 0
    );
    return {
      id: `session-${session.id}`,
      title: session.service,
      // فقط التفاصيل الحقيقية تُكتب هنا؛ الحالة تحملها الشارة، فلا تكرار للنص.
      subtitle: details.length > 0 ? details.join(' · ') : undefined,
      date: session.date,
      status: sessionTimelineStatus(session.status),
      iconType: 'session' as const,
      procedure: session.service,
      sessionStatus: session.status,
    };
  });
}

/**
 * Keeps the first event per id. Sessions are passed first by the callers, so the
 * richest version (procedure + plan state) wins over a thinner duplicate.
 */
export function dedupeTimelineItems(items: readonly SmartTimelineItem[]): SmartTimelineItem[] {
  const seen = new Set<string>();
  const out: SmartTimelineItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Newest first — ISO `YYYY-MM-DD` + `HH:MM` sort correctly as strings. */
export function sortTimelineDesc(items: readonly SmartTimelineItem[]): SmartTimelineItem[] {
  return [...items].sort((a, b) =>
    `${b.date}${b.time ?? ''}`.localeCompare(`${a.date}${a.time ?? ''}`)
  );
}

/**
 * The journey timeline = treatment sessions + appointments + every quick note
 * ("الخط الزمني يسجّل كل إضافة"), newest first and de-duplicated by id.
 *
 * `sessions` is optional so every existing caller keeps working untouched.
 */
export function buildSmartTimeline(params: {
  appointments: SmartAppointment[];
  quickNotes: QuickNote[];
  /** N27 — the dental plan (`metadata.sessions`) joins the journey line. */
  sessions?: readonly PatientSession[];
}): SmartTimelineItem[] {
  const visits: SmartTimelineItem[] = params.appointments.map((appt) => ({
    id: `appt-${appt.id}`,
    title: appt.service || 'موعد في العيادة',
    subtitle: appt.provider_name ? `مع د. ${appt.provider_name}` : undefined,
    date: appt.appointment_date,
    time: appt.appointment_time ?? undefined,
    status: appointmentTimelineStatus(appt.status),
    iconType: 'visit',
  }));

  const notes: SmartTimelineItem[] = params.quickNotes.map((note, index) => ({
    id: `note-${index}-${note.date}`,
    title: 'ملاحظة طبية',
    subtitle: note.by ? `${note.text} · ${note.by}` : note.text,
    date: note.date,
    status: 'completed',
    iconType: 'note',
  }));

  return sortTimelineDesc(
    dedupeTimelineItems([...buildSessionTimelineItems(params.sessions), ...visits, ...notes])
  );
}

/** Free-text search across ALL profile sections (name, phone, medical, notes…). */
export function matchesProfileSearch(query: string, patient: SmartPatientData): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const metadata = parsePatientMetadata(patient.metadata);
  const haystack = [
    patient.name,
    patient.phone ?? '',
    patient.email ?? '',
    patient.notes ?? '',
    metadata.age,
    metadata.date_of_birth,
    metadata.basic_info.gender,
    metadata.basic_info.blood_type,
    metadata.basic_info.address,
    metadata.medical_history.allergies,
    metadata.medical_history.medications,
    metadata.medical_history.chronic,
    metadata.medical_history.surgeries,
    metadata.insurance.provider,
    metadata.insurance.card_number,
    metadata.emergency_contact.name,
    metadata.emergency_contact.phone,
    metadata.quick_notes.map((n) => n.text),
  ]
    .flat()
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}


/** Account card body — the "إرسال" button on the balance card. */
export function buildInvoiceMessage(params: {
  patientName: string;
  balance: SmartPatientBalance;
  clinicName?: string | null;
}): string {
  const lines = [
    `مرحبًا ${params.patientName} 👋`,
    `إجمالي فواتيرك: ${formatMoneyAr(params.balance.invoiced)}`,
    `المدفوع: ${formatMoneyAr(params.balance.paid)}`,
    `المتبقي: ${formatMoneyAr(params.balance.due)}`,
  ];
  if (params.balance.due > 0) {
    lines.push('يمكنك إتمام الدفع عند زيارتك القادمة أو عبر رابط الدفع.');
  } else {
    lines.push('شكرًا لالتزامك — لا يوجد أي رصيد مستحق.');
  }
  if (params.clinicName) lines.push(`— ${params.clinicName}`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Cross-section search                                                */
/* ------------------------------------------------------------------ */

export type ProfileSectionId = 'basic' | 'medical' | 'insurance' | 'emergency' | 'notes';

export const PROFILE_SECTION_LABELS: Record<ProfileSectionId, string> = {
  basic: 'المعلومات الأساسية',
  medical: 'التاريخ الطبي',
  insurance: 'التأمين',
  emergency: 'اتصال الطوارئ',
  notes: 'ملاحظات الطبيب',
};

/**
 * "البحث في كل الأقسام": returns the ids of the profile sections whose content
 * matches the query (every section when the query is empty).
 */
export function searchProfileSections(
  query: string,
  context: {
    patient: SmartPatientData;
    metadata: SmartPatientMetadata;
    balance?: SmartPatientBalance;
  }
): ProfileSectionId[] {
  const all: ProfileSectionId[] = ['basic', 'medical', 'insurance', 'emergency', 'notes'];
  const normalized = query.trim().toLowerCase();
  if (!normalized) return all;

  const { metadata } = context;
  const medical = metadata.medical_history;
  const haystacks: Record<ProfileSectionId, string[]> = {
    basic: [
      context.patient.name,
      metadata.age,
      metadata.date_of_birth,
      metadata.basic_info.gender,
      metadata.basic_info.blood_type,
      metadata.basic_info.address,
      context.patient.phone ?? '',
      context.patient.email ?? '',
      context.balance ? formatMoneyAr(context.balance.due) : '',
    ],
    medical: [
      ...medical.allergies,
      ...medical.medications,
      ...medical.chronic,
      ...medical.surgeries,
      medical.smoking,
      medical.alcohol,
      medical.pregnancy,
    ],
    insurance: [
      metadata.insurance.provider,
      metadata.insurance.card_number,
      metadata.insurance.coverage,
      metadata.insurance.expiry,
    ],
    emergency: [
      metadata.emergency_contact.name,
      metadata.emergency_contact.phone,
      metadata.emergency_contact.relation,
    ],
    notes: metadata.quick_notes.map((note) => note.text),
  };

  return all.filter((id) =>
    haystacks[id]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  );
}

/* ------------------------------------------------------------------ */
/* Visit projections (extra-info card)                                 */
/* ------------------------------------------------------------------ */

/** Local YYYY-MM-DD for "today" — comparisons never use UTC days. */
export function toIsoDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const byDateAsc = (a: SmartAppointment, b: SmartAppointment) =>
  `${a.appointment_date}${a.appointment_time ?? ''}`.localeCompare(`${b.appointment_date}${b.appointment_time ?? ''}`);

/** The appointment the reminder card targets: soonest upcoming, not cancelled. */
export function pickNextAppointment(
  appointments: SmartAppointment[],
  today: string = toIsoDay()
): SmartAppointment | null {
  const upcoming = appointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show' && a.appointment_date >= today)
    .sort(byDateAsc);
  return upcoming[0] ?? null;
}

/** The most recent completed visit (last visit + current treatment source). */
export function pickLastCompletedVisit(appointments: SmartAppointment[]): SmartAppointment | null {
  const done = appointments.filter((a) => a.status === 'completed').sort(byDateAsc);
  return done[done.length - 1] ?? null;
}

/** 🦷 العلاج الحالي — the service of the newest visit, else the next one. */
export function currentTreatmentLabel(appointments: SmartAppointment[]): string {
  const last = pickLastCompletedVisit(appointments);
  if (last?.service) return last.service;
  const sorted = [...appointments].sort(byDateAsc);
  return sorted[sorted.length - 1]?.service ?? '';
}

/* ------------------------------------------------------------------ */
/* Dial / SMS / mail deep links                                        */
/* ------------------------------------------------------------------ */

export function buildTelHref(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/** SMS deep link — the channel option on the reminder card. */
export function buildSmsHref(phone: string | null | undefined, message: string): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}

/** Mail deep link — the email option on the reminder card. */
export function buildEmailHref(
  email: string | null | undefined,
  subject: string,
  message: string
): string | null {
  const address = (email ?? '').trim();
  if (!address.includes('@')) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

/* ------------------------------------------------------------------ */
/* Invoices + printable balance statement (PDF via the print dialog)   */
/* ------------------------------------------------------------------ */

export type SmartInvoiceRow = {
  id: string;
  invoice_number?: string | null;
  issued_at?: string | null;
  total?: number | string | null;
  status?: string | null;
};

type InvoiceRaw = Record<string, unknown>;

/** Normalizes the invoice views (`invoice_balances` / `invoices`) into one shape. */
export function parseInvoiceRows(payload: unknown): SmartInvoiceRow[] {
  const data = isRecord(payload) ? payload.data : payload;
  const list = Array.isArray(data) ? (data as InvoiceRaw[]) : [];
  return list
    .map((row) => ({
      id: asString(row.invoice_id ?? row.id),
      invoice_number: asString(row.invoice_number ?? row.number) || null,
      issued_at: asString(row.issued_at ?? row.invoice_date ?? row.created_at) || null,
      total: (row.total ?? row.invoiced_total ?? null) as number | string | null,
      status: asString(row.status) || null,
    }))
    .filter((row) => row.id.length > 0);
}

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  issued: 'صادرة',
  paid: 'مدفوعة',
  partially_paid: 'مدفوعة جزئيًا',
  overdue: 'متأخرة',
  voided: 'ملغاة',
};

export function invoiceStatusAr(status?: string | null): string {
  if (!status) return '—';
  return STATUS_AR[status] ?? status;
}

/** Minimal HTML escaping for values interpolated into the statement document. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Self-contained, print-ready balance statement. "إرفاق PDF" opens this in a
 * new tab: the doctor saves it as PDF from the browser print dialog (no server
 * renderer, no new dependency) and attaches it to the WhatsApp/email message.
 */
export function generateInvoiceStatementHtml(params: {
  patientName: string;
  clinicName?: string | null;
  balance: SmartPatientBalance;
  invoices?: SmartInvoiceRow[];
  today?: string;
}): string {
  const rows = (params.invoices ?? [])
    .map(
      (invoice) => `<tr>
        <td>${escapeHtml(invoice.invoice_number ?? invoice.id.slice(0, 8))}</td>
        <td>${escapeHtml(formatDateAr(invoice.issued_at))}</td>
        <td>${escapeHtml(invoiceStatusAr(invoice.status))}</td>
        <td class="num">${escapeHtml(formatMoneyAr(Number(invoice.total ?? 0)))}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>بيان حساب — ${escapeHtml(params.patientName)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 32px; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 12px; margin: 0 0 18px; }
  .totals { display: flex; gap: 16px; margin: 18px 0; flex-wrap: wrap; }
  .total { flex: 1; min-width: 140px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; }
  .total span { display: block; font-size: 11px; color: #64748b; }
  .total b { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: right; }
  th { background: #f8fafc; font-size: 12px; }
  .num { font-variant-numeric: tabular-nums; }
  footer { margin-top: 24px; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
  <h1>بيان حساب المريض</h1>
  <p class="muted">${escapeHtml(params.patientName)}${params.clinicName ? ` — ${escapeHtml(params.clinicName)}` : ''} · ${escapeHtml(params.today ?? toIsoDay())}</p>
  <div class="totals">
    <div class="total"><span>إجمالي الفواتير</span><b class="num">${escapeHtml(formatMoneyAr(params.balance.invoiced))}</b></div>
    <div class="total"><span>المدفوع</span><b class="num">${escapeHtml(formatMoneyAr(params.balance.paid))}</b></div>
    <div class="total"><span>المتبقي</span><b class="num">${escapeHtml(formatMoneyAr(params.balance.due))}</b></div>
  </div>
  ${rows ? `<table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">لا توجد فواتير مسجلة.</p>'}
  <footer>أُصدر هذا البيان آليًا من ملف المريض — يمكن حفظه كملف PDF من نافذة الطباعة.</footer>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Lifestyle labels                                                    */
/* ------------------------------------------------------------------ */

export const LIFESTYLE_OPTIONS = {
  smoking: ['لا', 'نعم', 'سابقًا'],
  alcohol: ['لا', 'نعم', 'سابقًا'],
  pregnancy: ['غير مطبّق', 'نعم', 'لا'],
} as const;

/** Renders a stored lifestyle value (may be any legacy string) into a chip. */
export function lifestyleChip(value: string): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  const normalized = value.trim();
  if (!normalized) return { label: 'غير مسجّل', tone: 'muted' };
  if (normalized === 'لا' || normalized === 'غير مطبّق' || normalized === 'سلبي') return { label: normalized, tone: 'ok' };
  return { label: normalized, tone: 'warn' };
}


/* ------------------------------------------------------------------ */
/* Quick notes                                                         */
/* ------------------------------------------------------------------ */

/** "الخط الزمني يسجّل كل إضافة" — new notes go on top, history is bounded. */
export function appendQuickNote(current: unknown, note: QuickNote, max = 50): SmartPatientMetadata {
  const base = parsePatientMetadata(current);
  const text = note.text.trim();
  if (!text) return base;
  const entry: QuickNote = {
    text,
    date: note.date || new Date().toISOString(),
    ...(note.by && note.by.trim() ? { by: note.by.trim() } : {}),
  };
  return {
    ...base,
    quick_notes: [entry, ...base.quick_notes.filter((n) => n.text !== text || n.date !== entry.date)].slice(0, max),
  };
}

/* ------------------------------------------------------------------ */
/* N26 — جلسات العلاج (Dental treatment sessions)                      */
/* ------------------------------------------------------------------ */

/** Stable key for a session: legacy entries with no id still parse to the same one. */
export function sessionId(date: string, service: string): string {
  const day = asString(date).trim().slice(0, 10);
  const name = asString(service).trim();
  if (!day && !name) return 'session';
  return `${day}|${name}`;
}

/** Accepts the three English states plus the Arabic labels doctors actually type. */
function normalizeSessionStatus(value: unknown): PatientSessionStatus {
  const raw = asString(value).trim().toLowerCase();
  if (raw === 'done' || raw === 'completed' || raw === 'منجزة' || raw === 'مكتملة' || raw === 'تمت') return 'done';
  if (raw === 'cancelled' || raw === 'canceled' || raw === 'ملغاة' || raw === 'ملغية') return 'cancelled';
  return 'planned';
}

function normalizeTreatmentType(value: unknown): PatientTreatmentType | undefined {
  const raw = asString(value).trim().toLowerCase();
  if (!raw) return undefined;
  const aliases: Array<[PatientTreatmentType, string[]]> = [
    ['حشوة', ['حشوة', 'حشو', 'filling', 'fill']],
    ['عصب', ['عصب', 'القناة', 'root canal', 'endo', 'endodontic']],
    ['خلع', ['خلع', 'قلع', 'extraction', 'extractions']],
    ['تلبيس', ['تلبيس', 'تاج', 'crown', 'veneer']],
    ['تنظيف', ['تنظيف', 'cleaning', 'scaling', 'polishing']],
    ['تقويم', ['تقويم', 'orthodontic', 'orthodontics', 'brace']],
    ['زراعة', ['زراعة', 'implant', 'implants']],
  ];
  for (const [label, tokens] of aliases) {
    if (tokens.some((token) => raw.includes(token.toLowerCase()))) return label;
  }
  return 'أخرى';
}

/**
 * Reads `metadata.sessions` defensively — the one rule of this codebase's JSONB:
 * a malformed plan must never break the patient file. Junk entries are dropped,
 * a bare string becomes a session, a missing id is synthesised, and two sessions
 * on the same day for the same service both survive (the key gets a suffix).
 */
export function parsePatientSessions(value: unknown): PatientSession[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: PatientSession[] = [];

  for (const entry of raw) {
    const record: Record<string, unknown> | null =
      typeof entry === 'string' ? { service: entry } : isRecord(entry) ? entry : null;
    if (!record) continue;

    const service = asString(record.service).trim();
    if (!service) continue;

    const date = asString(record.date).trim().slice(0, 10);
    const tooth = asString(record.tooth).trim();
    const note = asString(record.note).trim();
    const treatmentType = normalizeTreatmentType(record.treatment_type ?? record.procedure_type ?? record.type ?? service);
    const doctorId = asString(record.doctor_id ?? record.provider_id ?? record.doctorId).trim();
    const nextPlan = asString(record.next_plan ?? record.plan_next ?? record.nextPlan).trim();
    const declared = asString(record.id).trim();

    let id = declared || sessionId(date, service);
    let suffix = 2;
    while (seen.has(id)) id = `${declared || sessionId(date, service)}#${suffix++}`;
    seen.add(id);

    out.push({
      id,
      date,
      service,
      status: normalizeSessionStatus(record.status),
      ...(tooth ? { tooth } : {}),
      ...(treatmentType ? { treatment_type: treatmentType } : {}),
      ...(doctorId ? { doctor_id: doctorId } : {}),
      ...(nextPlan ? { next_plan: nextPlan } : {}),
      ...(note ? { note } : {}),
    });
  }

  return out;
}

export type SessionProgress = {
  /** done + planned — cancelled sessions are not part of the plan. */
  total: number;
  done: number;
  remaining: number;
  cancelled: number;
  percent: number;
  /** "3 من 6 جلسات" — ready for the progress bar label. */
  label: string;
};

/** "ما تم / ما بقي" for the treatment progress bar. */
export function sessionProgress(sessions: readonly PatientSession[]): SessionProgress {
  const done = sessions.filter((session) => session.status === 'done').length;
  const remaining = sessions.filter((session) => session.status === 'planned').length;
  const cancelled = sessions.filter((session) => session.status === 'cancelled').length;
  const total = done + remaining;
  return {
    total,
    done,
    remaining,
    cancelled,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    label: `${done} من ${total} جلسات`,
  };
}

/** New sessions go on top; the plan is bounded and never wipes a sibling key. */
export function appendPatientSession(
  current: unknown,
  session: PatientSessionDraft,
  max = 100
): SmartPatientMetadata {
  const base = parsePatientMetadata(current);
  const draft = parsePatientSessions([session])[0];
  if (!draft) return base;
  return {
    ...base,
    sessions: [draft, ...base.sessions.filter((entry) => entry.id !== draft.id)].slice(0, max),
  };
}

/** Status patch for one session ("تسجيل جلسة مكتملة" / إلغاء / إرجاع إلى مخطّطة). */
export function updatePatientSession(
  current: unknown,
  id: string,
  patch: Partial<Pick<PatientSession, 'status' | 'date' | 'service' | 'tooth' | 'treatment_type' | 'doctor_id' | 'next_plan' | 'note'>>
): SmartPatientMetadata {
  const base = parsePatientMetadata(current);
  return {
    ...base,
    sessions: base.sessions.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  };
}

export type ProcedureTone = {
  /** Colour dot shown next to the procedure name. */
  emoji: string;
  /** Card border + background wash. */
  ring: string;
  /** Procedure chip (Tailwind ring + text). */
  chip: string;
  /** Accent bar on the card's leading edge. */
  bar: string;
  /** Hover glow for the action rail. */
  glow: string;
};

/**
 * N26 — colour by procedure: حشوة أزرق · عصب بنفسجي · خلع أحمر · تلبيس ذهبي ·
 * تنظيف أخضر. Matching is a substring test so "حشوة ضرس 36" still lands on blue.
 */
const PROCEDURE_TONES: { match: string[]; tone: ProcedureTone }[] = [
  {
    match: ['حشو', 'حشوة', 'filling'],
    tone: {
      emoji: '🟦',
      ring: 'border-blue-500/40 bg-blue-500/[0.06]',
      chip: 'bg-blue-500/15 text-blue-200 ring-blue-500/30',
      bar: 'bg-blue-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(59,130,246,0.55)]',
    },
  },
  {
    // NOTE: no bare "لب" token here — it is a substring of "تلبيس" (crown) and
    // painted every crown violet. Real endo labels always contain "عصب" or "جذر".
    match: ['عصب', 'قناة الجذر', 'root canal', 'endo'],
    tone: {
      emoji: '🟪',
      ring: 'border-violet-500/40 bg-violet-500/[0.06]',
      chip: 'bg-violet-500/15 text-violet-200 ring-violet-500/30',
      bar: 'bg-violet-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(139,92,246,0.55)]',
    },
  },
  {
    match: ['خلع', 'قلع', 'extraction'],
    tone: {
      emoji: '🟥',
      ring: 'border-rose-500/40 bg-rose-500/[0.06]',
      chip: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
      bar: 'bg-rose-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(244,63,94,0.55)]',
    },
  },
  {
    match: ['تلبيس', 'تاج', 'crown'],
    tone: {
      emoji: '🟨',
      ring: 'border-amber-500/40 bg-amber-500/[0.06]',
      chip: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
      bar: 'bg-amber-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.55)]',
    },
  },
  {
    match: ['تنظيف', 'cleaning', 'scaling'],
    tone: {
      emoji: '🟩',
      ring: 'border-emerald-500/40 bg-emerald-500/[0.06]',
      chip: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
      bar: 'bg-emerald-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.55)]',
    },
  },
  {
    match: ['تقويم', 'orthodontic', 'orthodontics'],
    tone: {
      emoji: '🟦',
      ring: 'border-cyan-500/40 bg-cyan-500/[0.06]',
      chip: 'bg-cyan-500/15 text-cyan-200 ring-cyan-500/30',
      bar: 'bg-cyan-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.55)]',
    },
  },
  {
    match: ['زراعة', 'implant', 'implants'],
    tone: {
      emoji: '🟧',
      ring: 'border-orange-500/40 bg-orange-500/[0.06]',
      chip: 'bg-orange-500/15 text-orange-200 ring-orange-500/30',
      bar: 'bg-orange-400',
      glow: 'hover:shadow-[0_0_24px_-4px_rgba(251,146,60,0.55)]',
    },
  },
];

const DEFAULT_PROCEDURE_TONE: ProcedureTone = {
  emoji: '🦷',
  ring: 'border-slate-700 bg-slate-950/50',
  chip: 'bg-slate-800 text-slate-300 ring-slate-700',
  bar: 'bg-slate-500',
  glow: 'hover:shadow-[0_0_20px_-6px_rgba(148,163,184,0.45)]',
};

export function sessionProcedureTone(service: string | null | undefined): ProcedureTone {
  const name = asString(service).trim().toLowerCase();
  if (!name) return DEFAULT_PROCEDURE_TONE;
  for (const entry of PROCEDURE_TONES) {
    if (entry.match.some((token) => name.includes(token.toLowerCase()))) return entry.tone;
  }
  return DEFAULT_PROCEDURE_TONE;
}

export const SESSION_STATUS_AR: Record<PatientSessionStatus, string> = {
  done: 'مكتملة',
  planned: 'مخطّطة',
  cancelled: 'ملغاة',
};

export function sessionStatusAr(status: unknown): string {
  return SESSION_STATUS_AR[normalizeSessionStatus(status)];
}


