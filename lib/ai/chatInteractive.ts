/**
 * طبقة الردود التفاعلية في المحادثة (أزرار سريعة + بطاقات خيارات + مؤشر تقدّم الحجز).
 *
 * قواعد التصميم:
 *  - بيانات خالصة (بلا JSX) لتُستخدم في الخادم والواجهة معاً.
 *  - لا نخترع أي قيمة: كل بطاقة تُشتق من سياق الحجز الذي حسبه الـ orchestrator أصلاً
 *    (العيادات/الخدمات/الأوقات/ساعات العمل). القارئ «دفاعي» فلا ينكسر إذا تغيّر شكل الحقول.
 *  - RTL أولاً، وتسميات عربية.
 */

export type QuickReply = { label: string; value: string };

export type OptionCard = {
  id: string;
  title: string;
  subtitle?: string;
  price?: string;
  icon?: string;
  /** القيمة النصية المُرسلة عند الضغط (إن لم تُحدد تُستخدم title). */
  value?: string;
  /**
   * B — خيار غير متاح (وقت محجوز مثلاً): يُعرض باهتاً ولا يقبل الضغط.
   * يأتي دائماً من بيانات خادمية (day_slots)، لا يُحسب في الواجهة أبداً.
   */
  disabled?: boolean;
};

export type OptionCardGroup = {
  kind: 'clinic' | 'service' | 'provider' | 'day' | 'time';
  label: string;
  items: OptionCard[];
};

export type BookingProgressStep = { key: string; label: string; done: boolean };

export type ChatInteractive = {
  quick_replies?: QuickReply[];
  card_group?: OptionCardGroup;
  booking_step?: string;
  progress?: BookingProgressStep[];
};

/** خطوات الحجز المعروضة في شريط التقدّم (بالترتيب). */
export const BOOKING_PROGRESS: { key: string; label: string }[] = [
  { key: 'service_selection', label: 'الخدمة' },
  { key: 'provider_selection', label: 'المقدّم' },
  { key: 'date_selection', label: 'التاريخ' },
  { key: 'time_selection', label: 'الوقت' },
  { key: 'details', label: 'البيانات' },
  { key: 'confirmation', label: 'التأكيد' },
];

/** أسماء الأيام بالعربية — فهرس 0 = الأحد (نفس weekday في DB). */
export const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

/** أسئلة مقترحة لكل نوع نشاط (المرحلة 3.2). */
export function quickQuestionsForActivity(activityType: string | null | undefined): string[] {
  switch ((activityType ?? '').toLowerCase()) {
    case 'imaging_center':
    case 'imaging':
      return ['تصوير بانوراما', 'تصوير CBCT', 'تصوير مقطعي', 'تصوير أسنان كامل', 'حالة طارئة'];
    case 'dental_lab':
      return ['تركيبة أسنان', 'تاج', 'جسر', 'طقم', 'تقويم شفاف'];
    case 'clinic':
    case 'dental_clinic':
      return ['ألم أسنان', 'فحص دوري', 'تنظيف', 'تقويم', 'زراعة', 'حالة طارئة'];
    default:
      return [];
  }
}

/** تسمية نوع النشاط لمجموعات البطاقات. */
export function activityEntityLabel(activityType: string | null | undefined): string {
  switch ((activityType ?? '').toLowerCase()) {
    case 'imaging_center':
    case 'imaging':
      return 'مركز تصوير';
    case 'dental_lab':
      return 'مختبر أسنان';
    default:
      return 'عيادة';
  }
}

/** مؤشر تقدّم الحجز من خطوة الحجز الحالية. */
export function buildProgress(bookingStep: string | null | undefined): BookingProgressStep[] | undefined {
  const step = (bookingStep ?? '').trim();
  if (!step || step === 'idle' || step === 'completed') return undefined;
  const normalized = step === 'name_collection' || step === 'phone_collection' ? 'details' : step;
  const index = BOOKING_PROGRESS.findIndex((s) => s.key === normalized);
  if (index === -1) return undefined;
  return BOOKING_PROGRESS.map((s, i) => ({ key: s.key, label: s.label, done: i < index }));
}

type AnyRecord = Record<string, unknown>;

const CLINIC_KEYS = ['clinic_options', 'clinicOptions', 'clinics', 'suggested_clinics', 'suggestedClinics', 'clinic_matches', 'clinicMatches'];
const SERVICE_KEYS = ['service_options', 'serviceOptions', 'services', 'matched_services', 'matchedServices'];
const PROVIDER_KEYS = ['provider_options', 'providerOptions', 'providers', 'available_providers', 'availableProviders'];
const DAY_KEYS = ['days', 'available_days', 'availableDays', 'dates', 'availableDates'];
const SLOT_KEYS = ['slots', 'available_slots', 'availableSlots', 'times', 'available_times', 'availableTimes'];

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** بحث عرضي (BFS) عن أول مصفوفة تحت أحد أسماء المفاتيح المرشّحة، في أي عمق محدود. */
function findArray(root: unknown, keys: string[], maxDepth = 4): unknown[] | null {
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const { value, depth } = next;
    if (depth > maxDepth || !isRecord(value) || seen.has(value)) continue;
    seen.add(value);
    for (const key of keys) {
      const candidate = value[key];
      if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }
    for (const child of Object.values(value)) {
      if (isRecord(child) || Array.isArray(child)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstString(item: AnyRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(item[key]);
    if (value) return value;
  }
  return undefined;
}

/** "09:30:00" → "09:30" (ويترك القيم غير المعروفة كما هي). */
/**
 * يستخرج الوقت من أي نص: "09:00" أو ISO مثل "2026-09-20T09:00:00+03:00".
 * أي نص غير وقتي (مثل "صباحاً") يُعاد كما هو للعرض كعنوان فقط.
 */
function formatTime(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(raw);
  if (!match) return raw;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function formatPrice(item: AnyRecord): string | undefined {
  const fixed = str(item.price) ?? str(item.price_amount) ?? str(item.priceAmount);
  if (fixed) return `${fixed} ₪`;
  const min = str(item.price_min) ?? str(item.priceMin);
  const max = str(item.price_max) ?? str(item.priceMax);
  if (min && max && min !== max) return `${min}–${max} ₪`;
  if (min) return `${min} ₪`;
  return undefined;
}

/**
 * القيمة المُرسلة عند الضغط على بطاقة وقت.
 *
 * النقر في الواجهة يُرسل `value` كرسالة نصية، فيجب أن تكون وقتاً صريحاً بصيغة
 * HH:MM (نفس صيغة provider_schedules) ليفهمها المحلّل الخادمي. بدونها كان
 * `undefined` يُرسَل فيقول الـ AI «غير واضح».
 */
function toSendableTime(raw: unknown): string | undefined {
  const text = typeof raw === 'string' ? raw.trim() : undefined;
  if (!text) return undefined;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function toCard(kind: OptionCardGroup['kind'], item: unknown, index: number): OptionCard | null {
  // عناصر نصية خام (مثل slots: string[] أو ISO) — كانت تُهمَل فتختفي بطاقة الوقت
  // كلياً فلا يوجد ما يُنقر. نحوّلها إلى بطاقة وقت بقيمة 24h قابلة للإرسال.
  if (typeof item === 'string') {
    if (kind !== 'time') return null;
    const clock = toSendableTime(item);
    if (!clock) return null;
    return { id: `time-${index}`, title: clock, value: clock };
  }
  if (!isRecord(item)) return null;
  const id = firstString(item, ['id', 'uuid', 'slug']) ?? `${kind}-${index}`;
  if (kind === 'time') {
    const value =
      formatTime(item.time) ??
      formatTime(item.start_time) ??
      formatTime(item.start) ??
      formatTime(item.starts_at) ??
      formatTime(item.slot);
    if (!value) return null;
    const sendValue =
      toSendableTime(item.time) ??
      toSendableTime(item.start_time) ??
      toSendableTime(item.start) ??
      toSendableTime(item.starts_at) ??
      toSendableTime(item.slot);
    return {
      id,
      title: value,
      subtitle: formatTime(item.end_time) ?? formatTime(item.end),
      // FIX-1: القيمة المُرسلة عند النقر دائماً 24h (HH:MM) ليفهمها parseSlot.
      // بدونها كان النقر يُرسل undefined فيقول الـ AI «غير واضح».
      value: sendValue ?? value,
    };
  }
  if (kind === 'day') {
    const weekday = typeof item.weekday === 'number' ? item.weekday : undefined;
    const label = firstString(item, ['label', 'day', 'name']) ?? (weekday !== undefined ? ARABIC_DAYS[weekday] : undefined);
    const date = firstString(item, ['date', 'iso']);
    if (!label && !date) return null;
    return { id, title: label ?? date ?? id, subtitle: date && label ? date : undefined };
  }
  const title = firstString(item, ['name', 'title', 'label', 'full_name', 'fullName']);
  if (!title) return null;
  const subtitle = firstString(item, ['city', 'location', 'address', 'specialty', 'description', 'duration_label']);
  const price = kind === 'service' ? formatPrice(item) : undefined;
  const icon = kind === 'clinic' ? '🏥' : kind === 'service' ? '🩺' : kind === 'provider' ? '' : undefined;
  return { id, title, subtitle, price, icon };
}

function buildGroup(
  pending: unknown,
  kind: OptionCardGroup['kind'],
  keys: string[],
  label: string,
  limit: number
): OptionCardGroup | undefined {
  const items = findArray(pending, keys);
  if (!items) return undefined;
  const cards = items
    .map((item, index) => toCard(kind, item, index))
    .filter((card): card is OptionCard => card !== null)
    .slice(0, limit);
  if (cards.length === 0) return undefined;
  return { kind, label, items: cards };
}

/* ===== مُنشئ الردود التفاعلية — يشتق كل شيء من مصادر الحقيقة على الخادم فقط ===== */

const TIME_SLOT_KEYS = ['time_slots', 'timeSlots', 'slots', 'available_slots', 'availableSlots', 'suggested_slots', 'suggestedSlots', 'time_options', 'timeOptions', 'times'];
const DAY_SLOT_KEYS = ['day_options', 'dayOptions', 'days', 'available_days', 'availableDays', 'date_options', 'dateOptions', 'dates'];

export type ChatInteractiveInput = {
  /** projection الحجز من buildPendingBookingContext (المرجع الأول). */
  bookingContext?: unknown;
  /** كائن { state?, booking_step? } للمحادثة إن وُجد. */
  conversationState?: unknown;
  /** metadata المحادثة/الرسالة كما خزّنها الـ orchestrator. */
  metadata?: unknown;
  activityType?: string | null;
};

function readBookingStep(source: unknown): string | undefined {
  if (!isRecord(source)) return undefined;
  return firstString(source, ['booking_step', 'bookingStep', 'step', 'current_step', 'currentStep']);
}

/** يشتق خطوة الحجز من projection الحجز الحقيقي (slot/missing/تأكيد المريض). */
function deriveBookingStepFromContext(ctx: unknown): string | undefined {
  if (!isRecord(ctx)) return undefined;
  const slot = typeof ctx.slot === 'string' && ctx.slot ? ctx.slot : null;
  const missing = Array.isArray(ctx.missing)
    ? (ctx.missing as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];
  const hasIdentityGap = missing.some(
    (m) => m === 'patient_name' || m === 'name' || m === 'phone' || m === 'patient_phone'
  );
  const confirmed = ctx.patient_confirmed_booking === true;
  if (slot && missing.length === 0) return confirmed ? 'completed' : 'confirmation';
  if (slot && hasIdentityGap) return 'details';
  if (slot) return 'time_selection';
  if (missing.includes('slot')) return 'date_selection';
  if (ctx.booking_service_id || ctx.recommended_service_id) return 'service_selection';
  return undefined;
}

/**
 * يبني حمولة الردود التفاعلية (أزرار سريعة + بطاقات + مؤشر تقدّم) من:
 *  - projection الحجز (booking_context) الذي حسبه buildPendingBookingContext
 *    (يتضمن slot الحقيقي من التوفر + الحقول الناقصة).
 *  - conversation_state + metadata (حيث يعلّم الـ orchestrator نية الحجز عبر actions).
 *
 * قواعد:
 *  - بطاقة واحدة فقط تُعرض (الأكثر صلة): وقت ← يوم ← مقدّم ← خدمة ← منشأة.
 *  - لا يُخترع أي خيار: الموعد الوحيد المعروض هو slot محقَّق من التوفر في DB.
 *  - لا أزرار في خطوات الاسم/الهاتف (يجب الكتابة اليدوية).
 */
export function buildChatInteractive(input: ChatInteractiveInput): ChatInteractive {
  const bookingCtx = input.bookingContext ?? null;
  const meta = input.metadata ?? null;

  const bookingStep =
    readBookingStep(input.conversationState) ??
    readBookingStep(meta) ??
    deriveBookingStepFromContext(bookingCtx);

  const progress = buildProgress(bookingStep);

  // بطاقة الموعد المقترح — من slot حقيقي محفوظ بعد التحقق من التوفر فقط.
  let slotCard: OptionCardGroup | undefined;
  if (isRecord(bookingCtx) && typeof bookingCtx.slot === 'string' && bookingCtx.slot) {
    const [date, time] = bookingCtx.slot.split('T');
    if (time) {
      const dayIndex = date ? new Date(`${date}T00:00:00Z`).getUTCDay() : -1;
      const dayName = dayIndex >= 0 ? (ARABIC_DAYS as readonly string[])[dayIndex] ?? '' : '';
      slotCard = {
        kind: 'time',
        label: 'الموعد المقترح — أكّده أو اطلب غيره',
        items: [
          {
            id: 'proposed-slot',
            title: time.slice(0, 5),
            subtitle: [dayName, date].filter(Boolean).join(' — '),
            icon: '🕒',
            value: 'نعم، أكّد هذا الموعد',
          },
        ],
      };
    }
  }

  const sources = { booking: bookingCtx, state: input.conversationState, meta };
  const cardGroup =
    slotCard ??
    buildGroup(sources, 'time', TIME_SLOT_KEYS, 'الأوقات المتاحة — اختر واحداً', 12) ??
    buildGroup(sources, 'day', DAY_SLOT_KEYS, 'الأيام المتاحة', 7) ??
    buildGroup(sources, 'provider', PROVIDER_KEYS, 'اختر المقدّم', 6) ??
    buildGroup(sources, 'service', SERVICE_KEYS, 'اختر الخدمة', 6) ??
    buildGroup(sources, 'clinic', CLINIC_KEYS, 'اختر المنشأة', 3);

  let quickReplies: QuickReply[] | undefined;
  if (bookingStep === 'confirmation') {
    quickReplies = [
      { label: 'نعم، أكّد الحجز', value: 'نعم، أكّد الحجز' },
      { label: 'لا، غيّر الموعد', value: 'لا، أريد تغيير الموعد' },
    ];
  } else if (bookingStep === 'details') {
    quickReplies = undefined; // الاسم/الهاتف تُكتب يدوياً
  } else if (cardGroup?.kind === 'day') {
    quickReplies = [{ label: 'لا يناسبني، اقترح يوماً آخر', value: 'لا يناسبني هذا اليوم، هل من موعد آخر؟' }];
  } else if (cardGroup?.kind === 'time') {
    quickReplies = [{ label: 'لا يناسبني الوقت', value: 'لا يناسبني هذا الوقت، هل من موعد آخر؟' }];
  } else {
    // نية حجز واضحة من الـ orchestrator → أزرار تختصر الطريق.
    const actions = isRecord(meta) && Array.isArray(meta.actions) ? (meta.actions as unknown[]) : [];
    const suggestsBooking = actions.some((a) => isRecord(a) && a.type === 'suggest_booking');
    if (suggestsBooking) {
      quickReplies = [
        { label: 'نعم، أريد الحجز', value: 'نعم، أريد حجز هذا الموعد' },
        { label: 'ما هي الأسعار؟', value: 'ما هي أسعار الخدمات؟' },
      ];
    }
  }

  if (!bookingStep && !cardGroup && !quickReplies) return {};
  return { quick_replies: quickReplies, card_group: cardGroup, booking_step: bookingStep, progress };
}