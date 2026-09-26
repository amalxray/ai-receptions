/**
 * CROSS-TENANT REFERRALS — shared PURE referral model (CLIENT-SAFE).
 *
 * B20 — the referral between a dental clinic and an imaging center already has
 * a real data model (`imaging_requests` + `organization_relationships` +
 * `medical_files` + `imaging_results`); what was missing was the RETURN leg and
 * its visibility. This module is the single source of the referral VOCABULARY
 * used by the APIs, the dashboard pages and the tests:
 *   * Arabic labels + StatusPill tones for every imaging_requests state
 *   * direction of a referral from one organization's point of view
 *   * the notification contract (event → title/body) written when a referral
 *     moves, so the bell + toast never invent their own wording
 *   * the clarification note composer («طلب استكمال» — the reverse leg)
 *
 * No server imports here: pages (client) and routes (server) share it verbatim.
 */

/** Every state the imaging_requests workflow can hold (see workflowStates.ts). */
export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  requested: 'طلب مبدئي',
  submitted: 'مُرسل — بانتظار القبول',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  needs_clarification: 'يحتاج توضيحًا',
  scheduled: 'مجدول',
  in_progress: 'قيد التنفيذ',
  ready: 'جاهز للتسليم',
  completed: 'مكتمل',
  delivered: 'مُسلّم',
  cancelled: 'ملغى',
};

export function referralStatusLabel(status: string | null | undefined): string {
  if (!status) return 'غير معروف';
  return REFERRAL_STATUS_LABELS[status] ?? status;
}

/** StatusPill tone per state (mirrors the imaging-center inbox palette). */
export function referralStatusTone(
  status: string | null | undefined,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'completed':
    case 'delivered':
    case 'accepted':
      return 'success';
    case 'submitted':
    case 'needs_clarification':
      return 'warning';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** States after which the referral can no longer move (see the state machine). */
export const REFERRAL_TERMINAL_STATUSES = ['rejected', 'completed', 'delivered', 'cancelled'] as const;

export function isReferralTerminal(status: string | null | undefined): boolean {
  return typeof status === 'string' && (REFERRAL_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const REFERRAL_PRIORITY_LABELS: Record<string, string> = {
  routine: 'عادي',
  urgent: 'عاجل',
};

export function referralPriorityLabel(priority: string | null | undefined): string {
  if (!priority) return REFERRAL_PRIORITY_LABELS.routine;
  return REFERRAL_PRIORITY_LABELS[priority] ?? priority;
}

/** The two sides of one referral row, from the caller's point of view. */
export type ReferralDirection = 'outgoing' | 'incoming';

/**
 * `outgoing` = my organization SENT this referral (I am the referring clinic);
 * `incoming` = my organization RECEIVED it (I own the activity side).
 * `null` = my organization is not a party to this row (must never be shown).
 */
export function referralDirection(
  myClinicId: string | null | undefined,
  request: { clinic_id?: string | null; referring_clinic_id?: string | null },
): ReferralDirection | null {
  if (!myClinicId) return null;
  if (request.referring_clinic_id && request.referring_clinic_id === myClinicId) return 'outgoing';
  if (request.clinic_id && request.clinic_id === myClinicId) return 'incoming';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Notification contract                                                       */
/* -------------------------------------------------------------------------- */

export const REFERRAL_NOTIFICATION_EVENTS = [
  'referral_submitted',
  'referral_accepted',
  'referral_rejected',
  'referral_needs_clarification',
  'referral_result_ready',
] as const;

export type ReferralNotificationEvent = (typeof REFERRAL_NOTIFICATION_EVENTS)[number];

export function isReferralNotificationEvent(value: unknown): value is ReferralNotificationEvent {
  return typeof value === 'string' && (REFERRAL_NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

/**
 * The event for a workflow transition (null = nothing worth notifying: the
 * internal production chain scheduled → in_progress → ready is the center's
 * private business, not news for the referring clinic).
 */
export function eventForStatusTransition(toStatus: string | null | undefined): ReferralNotificationEvent | null {
  if (toStatus === 'accepted') return 'referral_accepted';
  if (toStatus === 'rejected') return 'referral_rejected';
  if (toStatus === 'needs_clarification') return 'referral_needs_clarification';
  return null;
}

export const REFERRAL_TITLE_MAX = 120;
export const REFERRAL_BODY_MAX = 500;

/** Collapses whitespace and clips to `max` chars (ellipsis counted); null-safe. */
export function clip(value: string | null | undefined, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}


export type ReferralNotificationContext = {
  requestId: string;
  /** Absolute dashboard path of the referral detail page (built by the caller). */
  link: string;
  patientRef?: string | null;
  counterpartName?: string | null;
  serviceName?: string | null;
  /** Extra text shown only for clarification requests. */
  note?: string | null;
};

export type ReferralNotificationPayload = {
  event: ReferralNotificationEvent;
  title: string;
  body: string;
  link: string;
};

/**
 * Builds the notification ALWAYS from the RECIPIENT's point of view:
 *   referral_submitted          → the imaging center is told about the referral
 *   referral_accepted/rejected  → the referring clinic is told about the answer
 *   referral_needs_clarification→ the party that must answer is told
 *   referral_result_ready       → the referring clinic is told the study is in
 */
export function buildReferralNotification(
  event: ReferralNotificationEvent,
  ctx: ReferralNotificationContext,
): ReferralNotificationPayload {
  const who = clip(ctx.counterpartName, 80) || 'الطرف الآخر';
  const patient = clip(ctx.patientRef, 80) || 'مريض مُحال';
  const service = clip(ctx.serviceName, 120);
  const suffix = service ? ` — ${service}` : '';
  const note = clip(ctx.note, 200);
  const withNote = note ? `: ${note}` : '';

  const titles: Record<ReferralNotificationEvent, string> = {
    referral_submitted: `🩻 تحويل جديد من ${who}`,
    referral_accepted: '✅ تم قبول التحويل',
    referral_rejected: '❌ تم رفض التحويل',
    referral_needs_clarification: '❓ طلب توضيح على تحويل',
    referral_result_ready: '📤 وصلت نتيجة التصوير',
  };

  const bodies: Record<ReferralNotificationEvent, string> = {
    referral_submitted: `المريض ${patient}${suffix}. راجع الطلب واقبله أو اطلب توضيحًا.`,
    referral_accepted: `قبل ${who} تحويل المريض ${patient}${suffix}.`,
    referral_rejected: `رفض ${who} تحويل المريض ${patient}${suffix}.`,
    referral_needs_clarification: `طلب ${who} توضيحًا بشأن المريض ${patient}${suffix}${withNote}`,
    referral_result_ready: `أرسل ${who} نتيجة تصوير المريض ${patient}${suffix}. افتح التحويل للاطلاع والتنزيل.`,
  };

  return {
    event,
    title: clip(titles[event], REFERRAL_TITLE_MAX),
    body: clip(bodies[event], REFERRAL_BODY_MAX),
    link: ctx.link,
  };
}

/* -------------------------------------------------------------------------- */
/* Clarification note (the reverse leg: referrer → activity)                    */
/* -------------------------------------------------------------------------- */

/** Column contract of `imaging_requests.notes` as used by the PATCH schema. */
export const REFERRAL_NOTES_MAX = 2000;
export const CLARIFICATION_MARKER = '[استكمال]';

/**
 * Appends a dated clarification line to the shared notes thread.
 *
 * The referring clinic may NOT drive the partner's workflow (status stays owned
 * by the activity tenant), so its «طلب استكمال» is a NOTE. Appending keeps the
 * history instead of clobbering whatever the center wrote, and the hard cap
 * keeps the value inside the 2000-char contract used by the PATCH schema — the
 * newest content always survives.
 */
export function appendClarificationNote(
  existing: string | null | undefined,
  note: string,
  at: Date | string,
): string {
  const clean = clip(note, 800);
  const base = String(existing ?? '').trim().slice(0, REFERRAL_NOTES_MAX);
  if (!clean) return base;
  const day = (typeof at === 'string' ? at : at.toISOString()).slice(0, 10);
  const line = `${CLARIFICATION_MARKER} ${day}: ${clean}`;
  const composed = base ? `${base}\n\n${line}` : line;
  if (composed.length <= REFERRAL_NOTES_MAX) return composed;
  return `…${composed.slice(composed.length - (REFERRAL_NOTES_MAX - 1))}`;
}

/** True when a notes line is a clarification request (reverse-leg marker). */
export function isClarificationNote(line: string): boolean {
  return line.trim().startsWith(CLARIFICATION_MARKER);
}

/** Arabic label of the modality/imaging type stored on the request. */
export function imagingTypeLabel(modality: string | null | undefined, fallback?: string | null): string {
  const key = String(modality ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    panorama: 'بانوراما',
    panoramic: 'بانوراما',
    cbct: 'CBCT',
    '3d': 'تصوير ثلاثي الأبعاد',
    joint: 'تصوير مفصلي',
    tmj: 'مفصل الفك (TMJ)',
    single: 'صورة مفردة',
    periapical: 'ذروية (Periapical)',
    bitewing: 'إطباقية (Bitewing)',
    lateral: 'جانبية (Lateral)',
    cephalometric: 'سيفالومترية',
    occlusal: 'إطباقية (Occlusal)',
  };
  if (key && labels[key]) return labels[key];
  const service = clip(fallback, 120);
  return service || clip(modality, 120) || 'غير محدد';
}

