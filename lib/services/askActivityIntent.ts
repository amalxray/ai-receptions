import { isActivityType, type ActivityType } from './activityTypes';

/**
 * classifyActivity — maps an Arabic (or English) /ask service message to the
 * single platform activity that can serve it, or `null` when the intent is
 * ambiguous / unknown (caller then keeps its current "all types" behaviour).
 *
 * WHY: the /ask suggestion RPC returns clinic + imaging_center + dental_lab
 * rows ordered purely by distance. Without a per-request activity filter a
 * patient asking for a panorama (imaging) was shown dental clinics and vice
 * versa. This classifier is the pure, booking-independent decision layer that
 * lets the caller narrow suggestions to the one relevant activity.
 *
 * Order matters: the first matching family wins. Imaging is checked first
 * because its keywords (صورة / تصوير / أشعة) are the most distinctive and a
 * plain "صورة" must not be swallowed by the generic clinic "فحص/صورة" bucket.
 */

// ── imaging_center ── panoramas, x-rays, CBCT, cephalometric, "طبقي"…
// NOTE: verb forms (اصور / صور / صورة) are included because patients usually
// say "بدي اصور اسناني" (present-tense verb), not the noun "تصوير" — and the
// noun alone would let "اسناني" fall through to the clinic bucket.
const IMAGING =
  /(بانوراما|اشعة|إشعة|أشعة|تصوير|تصوير اشعة|اصور|صور|صورة اشعة|راديو|راديولو|رادiology|radiolog|مقطعي|cbct|سي\s?بي\s?سي\s?تي|سيفال|سيفالومتريك|طبقي|طبقية|x-?ray|xray|imaging|panorama|opg|cephalometric)/i;

// ── clinic (dental practice) ── extraction, implant, cleaning, filling…
const CLINIC =
  /(خلع|قلع|زراعة|زرع|تنظيف|حشو|تبييض|تفتيح|تقويم|عصب|علاج عصب|فحص|كشف|مراجعة|ترميم|تجميل|جل|لثة|ضرس|ضروس|سن|سني|أسنان|طاحون|وجع|implant|extraction|cleaning|filling|whitening|orthodont|root canal|checkup)/i;

// ── dental_lab ── crowns, bridges, dentures (فني / مختبر)…
// NOTE: bare "تاج" is intentionally avoided — it is a substring of "احتياج"
// ("I need") and would misclassify every request as a lab. Crown requests are
// matched via the distinctive "تركيب تاج" / "تاج زيركون" / "تيجان" instead.
const LAB =
  /(مختبر|فني|تركيب تاج|تاج زيركون|تيجان|جسر|جسور|طقم|أطقم|بدلة|زيركون|قشرة|فينير|crown|bridge|denture|veneer|zirconia|dental lab)/i;

export function classifyActivity(message: string, history: string[] = []): ActivityType | null {
  // Fold the recent conversation in so an activity declared earlier ("بدي
  // اصور اسناني") is not lost when the next turn is a generic location
  // confirmation ("الموقع تم تحديده، اقترح لي أقرب المراكز"). The CURRENT
  // message wins; older turns only fill in what the current one left open.
  const text = [message ?? '', ...history.map((h) => h ?? '')].join(' ').trim();
  if (!text) return null;

  if (IMAGING.test(text)) return 'imaging_center';
  if (LAB.test(text)) return 'dental_lab';
  if (CLINIC.test(text)) return 'clinic';

  // Unknown intent → null (caller keeps showing every activity type, as before).
  return null;
}

/** Re-export for callers that only need the type guard without importing twice. */
export { isActivityType };
export type { ActivityType };
