/**
 * N28 — patient search core: pure, synchronous, no React and no I/O.
 *
 * The patients page is a SEARCH-ONLY surface (B47 removed the paged list, so
 * there is nothing to paginate): the receptionist types a name / phone / email /
 * note and gets at most `SEARCH_RESULT_LIMIT` ranked rows, then opens the patient
 * panel underneath. Every rule of that search lives here so it can be unit
 * tested without a browser (tests/unit/patient-search-n28.test.ts).
 *
 * WHY ARABIC NORMALISATION MATTERS (measured against production on 2026-09-29):
 * the clinic had 43 patients and `full_name.ilike.%أبو خليل%` matched **0** rows
 * while `%ابو خليل%` matched 1 — the stored value is `ابو خليل فريتخ`. Postgres
 * `ILIKE` is not hamza/ta-marbuta aware, so the browser folds both sides of the
 * comparison into one Arabic shape (أ إ آ → ا، ة → ه، ى → ي) *before* matching,
 * and the API applies the same sanitiser so a server-side `q` behaves the same.
 *
 * WHY SANITISING MATTERS: `/api/patients?q=` used to interpolate the raw string
 * into PostgREST's `.or()` filter, and `.or()` uses `,` / `(` / `)` as syntax —
 * a comma in the input produced `failed to parse logic tree (...)`, i.e. an
 * HTTP 500 for a perfectly ordinary search. `sanitizeSearchQuery` strips those
 * tokens before they ever reach the filter string.
 */

/** Visible result cap — "قائمة 10 نتائج (حد أقصى)". */
export const SEARCH_RESULT_LIMIT = 10;

/** Rows the page asks the API for; the cap keeps the payload bounded. */
export const SEARCH_FETCH_LIMIT = 200;

/** The fields `searchPatients` reads. Every record shape in the app satisfies it. */
export type PatientSearchable = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  source?: string | null;
  status?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Canonical client-side patient row (the API's `toPatientShape` projection). */
export type PatientSearchRecord = PatientSearchable;

export type PatientSearchOutcome<T> = {
  /** Ranked, capped rows ready to render. */
  results: T[];
  /** How many rows matched in total — drives "عرض الكل (N)". */
  total: number;
  /** True when more than `limit` rows matched. */
  hasMore: boolean;
  /** The sanitised query actually used ('' when nothing was searched). */
  query: string;
};

export type HighlightSegment = { text: string; hit: boolean };

export type PatientStatusTone = {
  emoji: string;
  /** Arabic label shown on the chip (the stored status, or a fallback). */
  label: string;
  /** Tailwind classes for the chip (ring + background + text). */
  chip: string;
  /** Tailwind classes for the leading dot. */
  dot: string;
  /** Tailwind classes for the avatar wash. */
  wash: string;
};

export type GreetingAr = { text: string; emoji: string };

/* -------------------------------------------------------------------------- */
/* Arabic normalisation                                                       */
/* -------------------------------------------------------------------------- */

/** Harakat, Quranic marks and the tatweel (ـ) — invisible to a searching human. */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
/** Bidi marks + zero-width joiners/spaces: they break substring matching. */
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

const CHAR_FOLD: Record<string, string> = {
  // hamza forms → bare alef
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0672': '\u0627', // ٲ
  '\u0673': '\u0627', // ٳ
  // ta-marbuta → ha (ة → ه)
  '\u0629': '\u0647',
  // alef maqsura / hamza on ya / farsi ye → ya
  '\u0649': '\u064A', // ى
  '\u0626': '\u064A', // ئ
  '\u06CC': '\u064A', // ی
  // hamza on waw → waw
  '\u0624': '\u0648', // ؤ
  // farsi kaf → arabic kaf
  '\u06A9': '\u0643', // ک
};

function isDiacriticCode(code: number): boolean {
  return (
    (code >= 0x0610 && code <= 0x061a) ||
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06ed) ||
    code === 0x0640
  );
}

function isInvisibleCode(code: number): boolean {
  return (
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0x2060 ||
    code === 0xfeff
  );
}

/** One character → its folded form ('' means "drop it"). 1 char in, 0..1 out. */
function foldChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (isDiacriticCode(code) || isInvisibleCode(code)) return '';
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660); // ٠-٩
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0); // ۰-۹
  const folded = CHAR_FOLD[ch];
  if (folded !== undefined) return folded;
  return ch.toLowerCase();
}

/**
 * Folds `value` and records where every folded character came from.
 * `map[i]` = index in the folded text of original character `i`; the final
 * entry is the folded length, so `map[i + n]` is the end boundary of a match
 * starting at folded index `i`. Because each character yields at most one
 * folded character those boundaries are exact — that is what lets
 * `highlightSegments` paint the ORIGINAL text (with its hamzas) while matching
 * on the folded one.
 */
function foldWithMap(value: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (const ch of value) {
    map.push(text.length);
    text += foldChar(ch);
  }
  map.push(text.length);
  return { text, map };
}

/**
 * Search/normalisation form of a value: diacritics + invisibles removed, hamza
 * forms unified, ة → ه، ى → ي، Arabic-Indic digits → latin, latin lower-cased,
 * inner whitespace collapsed. Non-strings → ''.
 */
export function normalizeArabic(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  const stripped = value.replace(DIACRITICS, '').replace(INVISIBLES, '');
  let out = '';
  for (const ch of stripped) out += foldChar(ch);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * N28 — makes a user query safe for PostgREST's `.or()` filter without
 * weakening it: `,` `(` `)` `*` `:` `%` `\` and quotes are syntax tokens there,
 * so they become spaces (a comma must never split the filter into two arms).
 * Returns '' when nothing usable is left — callers must then skip the filter
 * entirely instead of sending `.or('')`.
 */
export function sanitizeSearchQuery(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[,()*:%\\"'`<>{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/* -------------------------------------------------------------------------- */
/* Field extraction                                                           */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Every searchable string of one patient: the four contract fields (اسم، هاتف،
 * بريد، ملاحظة) plus source/status and the metadata surfaces a receptionist may
 * quote (العنوان، الحساسية، الملاحظات السريعة). Missing/blank entries are
 * dropped so callers can join the array blindly.
 */
export function patientSearchFields(patient: PatientSearchable): string[] {
  const metadata = asRecord(patient.metadata) ?? {};
  const basicInfo = asRecord(metadata.basic_info);
  const medical = asRecord(metadata.medical_history);
  const quickNotes = Array.isArray(metadata.quick_notes)
    ? metadata.quick_notes.map((entry) => asText(asRecord(entry)?.text))
    : [];
  const fields = [
    patient.name,
    patient.phone,
    patient.email,
    patient.notes,
    patient.source,
    patient.status,
    asText(metadata.address),
    asText(basicInfo?.address),
    asText(basicInfo?.gender),
    asText(basicInfo?.blood_type),
    asText(metadata.date_of_birth),
    asText(metadata.age),
    asText(medical?.allergies),
    asText(medical?.medications),
    asText(medical?.chronic),
    ...quickNotes,
  ];
  return fields.filter(
    (field): field is string => typeof field === 'string' && field.trim().length > 0
  );
}

/**
 * The secondary surfaces only — used by the ranker after name/phone/email have
 * been tried, so a note hit never outranks a name hit.
 */
function secondarySearchText(patient: PatientSearchable): string {
  const metadata = asRecord(patient.metadata) ?? {};
  const basicInfo = asRecord(metadata.basic_info);
  const medical = asRecord(metadata.medical_history);
  const quickNotes = Array.isArray(metadata.quick_notes)
    ? metadata.quick_notes.map((entry) => asText(asRecord(entry)?.text))
    : [];
  return [
    patient.notes,
    patient.source,
    patient.status,
    asText(metadata.address),
    asText(basicInfo?.address),
    asText(basicInfo?.gender),
    asText(basicInfo?.blood_type),
    asText(metadata.date_of_birth),
    asText(metadata.age),
    asText(medical?.allergies),
    asText(medical?.medications),
    asText(medical?.chronic),
    ...quickNotes,
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

/* -------------------------------------------------------------------------- */
/* Matching + ranking                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Relevance score (0 = no match). Name beats phone beats email beats notes, and
 * "starts with" beats "contains", so typing «مح» surfaces «محمد …» before
 * «سماح …» instead of relying on insertion order.
 */
export function scorePatientMatch(patient: PatientSearchable, query: string): number {
  const needle = normalizeArabic(sanitizeSearchQuery(query));
  if (!needle) return 0;

  const name = normalizeArabic(patient.name);
  if (name) {
    if (name === needle) return 140;
    if (name.startsWith(needle)) return 120;
    if (name.split(' ').some((word) => word.startsWith(needle))) return 100;
    if (name.includes(needle)) return 80;
  }

  const phone = normalizeArabic(patient.phone);
  if (phone && phone.includes(needle)) return 70;

  const email = normalizeArabic(patient.email);
  if (email && email.includes(needle)) return 60;

  return normalizeArabic(secondarySearchText(patient)).includes(needle) ? 40 : 0;
}

/** True when the patient matches. An empty query matches NOTHING (N28 design). */
export function matchesPatientQuery(patient: PatientSearchable, query: string): boolean {
  return scorePatientMatch(patient, query) > 0;
}

/**
 * Ranked + capped search. An empty/unsanitisable query returns no rows: the page
 * intentionally has no list-on-open, so callers render the empty state straight
 * from `total === 0` without any extra flag.
 */
export function searchPatients<T extends PatientSearchable>(
  patients: readonly T[],
  query: string,
  limit: number = SEARCH_RESULT_LIMIT
): PatientSearchOutcome<T> {
  const needle = sanitizeSearchQuery(query);
  if (!needle || !Array.isArray(patients) || patients.length === 0) {
    return { results: [], total: 0, hasMore: false, query: '' };
  }

  const scored = patients
    .map((patient) => ({ patient, score: scorePatientMatch(patient, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.patient.name.localeCompare(b.patient.name, 'ar'));

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : SEARCH_RESULT_LIMIT;
  const results = scored.slice(0, safeLimit).map((entry) => entry.patient);
  return { results, total: scored.length, hasMore: scored.length > results.length, query: needle };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Splits `text` into plain / highlighted parts for one query hit. Matching runs
 * on the folded text; the returned slices come from the ORIGINAL text, so
 * «أبو خليل» keeps its hamza on screen while «ابو خليل» finds it.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const source = typeof text === 'string' ? text : '';
  if (!source) return [];
  const needle = foldWithMap(sanitizeSearchQuery(query)).text;
  if (!needle) return [{ text: source, hit: false }];

  const haystack = foldWithMap(source);
  const index = haystack.text.indexOf(needle);
  if (index < 0) return [{ text: source, hit: false }];

  const start = haystack.map[index] ?? 0;
  const end = haystack.map[index + needle.length] ?? source.length;
  const segments: HighlightSegment[] = [];
  if (start > 0) segments.push({ text: source.slice(0, start), hit: false });
  segments.push({ text: source.slice(start, end), hit: true });
  if (end < source.length) segments.push({ text: source.slice(end), hit: false });
  return segments.filter((segment) => segment.text.length > 0);
}

/** Avatar initials: «ابو خليل فريتخ» → «اخ». Never returns ''. */
export function patientInitials(name: string): string {
  const parts = (typeof name === 'string' ? name : '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

/**
 * Colour language of the page: 🟢 نشط · 🟡 متابعة · ⚫ منتهي · 🔴 متأخر.
 * A 5th neutral tone exists because 22 of the 43 production patients have NO
 * status at all — painting them red or green would be a lie, so they read ⚪.
 */
export function patientStatusTone(status: unknown): PatientStatusTone {
  const raw = typeof status === 'string' ? status.trim() : '';
  const label = raw || 'غير محدّد';
  const folded = normalizeArabic(raw);
  if (!folded) return NEUTRAL_TONE(label);
  // Checked before "نشط" on purpose: «غير نشط» contains «نشط».
  if (/(غير نشط|متاخر|late|overdue|متعثر)/.test(folded)) {
    return {
      emoji: '🔴',
      label,
      chip: 'bg-red-500/15 text-red-200 ring-red-500/30',
      dot: 'bg-red-400',
      wash: 'from-red-500/70 to-rose-600/70',
    };
  }
  if (/(منتهي|منتهيه|مكتمل|مغلق|مورشف|مؤرشف|ارشيف|archiv|inactive)/.test(folded)) {
    return {
      emoji: '⚫',
      label,
      chip: 'bg-slate-900 text-slate-400 ring-slate-600/60',
      dot: 'bg-slate-600',
      wash: 'from-slate-600 to-slate-800',
    };
  }
  if (/(متابعه|متابعة|follow|pending|قيد)/.test(folded)) {
    return {
      emoji: '🟡',
      label,
      chip: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
      dot: 'bg-amber-400',
      wash: 'from-amber-400/80 to-orange-500/80',
    };
  }
  if (/(نشط|جديد|جديده|مؤكد|مؤكده|active|confirmed|new)/.test(folded)) {
    return {
      emoji: '🟢',
      label,
      chip: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
      dot: 'bg-emerald-400',
      wash: 'from-emerald-400/80 to-teal-500/80',
    };
  }
  return NEUTRAL_TONE(label);
}

function NEUTRAL_TONE(label: string): PatientStatusTone {
  return {
    emoji: '⚪',
    label,
    chip: 'bg-slate-800/80 text-slate-300 ring-slate-700',
    dot: 'bg-slate-500',
    wash: 'from-slate-700 to-slate-800',
  };
}

/** ☀️ صباح الخير before noon, 🌙 مساء الخير after it. */
export function greetingAr(date: Date = new Date()): GreetingAr {
  const morning = date.getHours() < 12;
  return { text: morning ? 'صباح الخير' : 'مساء الخير', emoji: morning ? '☀️' : '🌙' };
}

/** «الاثنين، 29 سبتمبر 2026» — falls back to the ISO day if Intl is unavailable. */
export function formatDateLongAr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('ar', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Hijri line for the header, or null when the runtime has no Umm al-Qura data.
 * `resolvedOptions().calendar` is the honest probe — Intl silently falls back to
 * Gregorian instead of throwing, which would print a wrong Hijri date.
 */
export function formatHijriAr(date: Date = new Date()): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (formatter.resolvedOptions().calendar !== 'islamic-umalqura') return null;
    return `${formatter.format(date)} هـ`;
  } catch {
    return null;
  }
}

/** Local (clinic-clock) `YYYY-MM-DD` for "today" comparisons. */
export function localIsoDay(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True when an ISO timestamp/date falls on `day` (`YYYY-MM-DD`). */
export function isOnIsoDay(value: unknown, day: string): boolean {
  return typeof value === 'string' && value.slice(0, 10) === day;
}
