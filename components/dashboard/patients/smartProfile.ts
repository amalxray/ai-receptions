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
 */

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

export type SmartTimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  time?: string;
  status: 'completed' | 'in_progress' | 'remaining' | 'cancelled';
  iconType?: 'visit' | 'file' | 'referral' | 'invoice' | 'note' | 'medical';
};

export type QuickNote = {
  /** Free text exactly as the doctor typed it. */
  text: string;
  /** ISO timestamp — the timeline orders notes by this. */
  date: string;
  /** Author label (user email / role when known). */
  by?: string;
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

export type BasicInfo = {
  age: string;
  gender: string;
  blood_type: string;
  address: string;
};

export type SmartPatientMetadata = {
  date_of_birth: string;
  basic_info: BasicInfo;
  medical_history: MedicalHistory;
  insurance: InsuranceInfo;
  emergency_contact: EmergencyContact;
  quick_notes: QuickNote[];
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

  return {
    ...source,
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
  date_of_birth?: string;
  basic_info?: Partial<BasicInfo>;
  medical_history?: Partial<MedicalHistory>;
  insurance?: Partial<InsuranceInfo>;
  emergency_contact?: Partial<EmergencyContact>;
  quick_notes?: QuickNote[];
  /** Any custom key already stored by other features survives the round-trip. */
  [key: string]: unknown;
};

export function serializePatientMetadata(metadata: unknown): SerializedPatientMetadata {
  const meta = parsePatientMetadata(metadata);
  const out: Record<string, unknown> = {};

  const owned = new Set<string>([...GROUP_KEYS, 'date_of_birth', 'quick_notes']);
  for (const [key, value] of Object.entries(meta)) {
    if (owned.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }

  const dateOfBirth = meta.date_of_birth.trim();
  if (dateOfBirth) out.date_of_birth = dateOfBirth;

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

  return out;
}

/** Healthy default for a patient with no metadata yet. */
export function emptyMetadata(): SmartPatientMetadata {
  return {
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
  };
}

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
    { ok: Boolean(metadata.date_of_birth), label: 'تاريخ الميلاد' },
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
    { ok: Boolean(metadata.date_of_birth), label: 'تاريخ الميلاد' },
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
 * Converts a human phone into wa.me digits. Defaults to Jordan (+962) because
 * local numbers are written 07XXXXXXXX. Returns null when undialable.
 */
export function normalizePhoneForWhatsApp(
  phone?: string | null,
  defaultCountryCode = '962'
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
 * The journey timeline = appointments + every quick note ("الخط الزمني يسجّل
 * كل إضافة"), newest first.
 */
export function buildSmartTimeline(params: {
  appointments: SmartAppointment[];
  quickNotes: QuickNote[];
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

  return [...visits, ...notes].sort((a, b) => {
    const left = `${a.date}${a.time ?? ''}`;
    const right = `${b.date}${b.time ?? ''}`;
    return right.localeCompare(left);
  });
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

