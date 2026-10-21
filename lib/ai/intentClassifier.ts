import { getProvider } from './provider';
import { logEvent } from '@/lib/server/logging';
import type { ConversationIntent } from './intelligence';

/**
 * PRIMARY: LLM-based semantic intent classification.
 *
 * This classifier returns structured JSON describing what the patient means,
 * independent of exact wording. The LLM understands Arabic dialects, typos,
 * missing hamza, and a wide range of phrasings.
 *
 * Deterministic fast paths handle clear small talk, operational clinic questions,
 * explicit actions, and emergency safety signals. Other messages use the LLM.
 *
 * IMPORTANT: The local Ollama models currently installed (qwen2.5-coder:3b,
 * qwen2.5:3b, llama3.2:3b, qwen2.5:7b) are either too slow or produce poor
 * Arabic output. This architecture is IMPLEMENTED but not QUALITY-VERIFIED.
 */

export const SEMANTIC_INTENTS = {
  GREETING: 'greeting',
  GENERAL_QUESTION: 'general_question',
  DENTAL_GENERAL_QUESTION: 'dental_general_question',
  PATIENT_COMPLAINT: 'patient_complaint',
  CLINIC_INFORMATION: 'clinic_information',
  SERVICE_INFORMATION: 'service_information',
  PROVIDER_INFORMATION: 'provider_information',
  APPOINTMENT_BOOKING: 'appointment_booking',
  APPOINTMENT_CANCELLATION: 'appointment_cancellation',
  APPOINTMENT_RESCHEDULE: 'appointment_reschedule',
  HUMAN_HANDOFF: 'human_handoff',
  URGENT_SIGNAL: 'urgent_signal',
  GOODBYE: 'goodbye',
  UNKNOWN: 'unknown',
} as const;

export type SemanticIntent = (typeof SEMANTIC_INTENTS)[keyof typeof SEMANTIC_INTENTS];

/** Valid lowercase intent VALUES (the model returns lowercase per the prompt). */
const VALID_INTENT_VALUES = new Set<string>(Object.values(SEMANTIC_INTENTS));

export type SemanticIntentResult = {
  intent: SemanticIntent;
  confidence: number;
  /** Deterministic classification completed without an LLM call. */
  fastPath?: boolean;
  /** Precise operational intent when the semantic label is broader. */
  conversationIntent?: ConversationIntent;
  entities: {
    problem?: string;
    duration?: string;
    trigger?: string;
    urgency?: string;
    requested_service?: string;
    requested_specialty?: string;
    location?: string;
    time?: string;
  };
  raw?: unknown;
};

const CLASSIFIER_PROMPT = `You are the intent classifier for a healthcare clinic AI receptionist (dental clinics, imaging/radiology centers and other medical activities).
Classify the patient's message into EXACTLY ONE of these intents:
greeting | general_question | dental_general_question | patient_complaint
| clinic_information | service_information | provider_information
| appointment_booking | appointment_cancellation | appointment_reschedule
| human_handoff | urgent_signal | goodbye | unknown

Also extract relevant entities:
- problem: what hurts or the issue the patient describes
- duration: how long the problem has lasted
- trigger: what worsens or triggers it (e.g. cold, hot, pressure)
- urgency: low|normal|high|critical
- requested_service: if the patient names a service or a booking desire (e.g. "بانوراما", "تصوير أشعة", "تنظيف" comes back here)
- requested_specialty: if the patient names a specialty (implant, orthodontics, whitening, radiology, etc.)
- time: any time the patient names (e.g. "الساعة 2", "10:30")

Respond with ONLY valid JSON, no markdown:
{"intent": "...", "confidence": 0.0-1.0, "entities": {...}}

Examples to guide you:
- "مرحبا" → greeting
- "طاحونتي بتجعني من مبارح وكل ما اشرب بارد بتقتلني" → patient_complaint with problem=tooth/molar pain, duration="since yesterday", trigger="cold"
- "شو الفرق بين الزراعة والجسر؟" → dental_general_question
- "بدي احجز موعد عند الدكتور" → appointment_booking
- "بدي اتصور بانوراما يوم الاحد الساعة 2" → appointment_booking with requested_service="بانوراما", time="الساعة 2"
- "أريد تصوير أشعة" → appointment_booking with requested_service="تصوير أشعة"
- "بدي صورة اشعة للاسنان" → appointment_booking with requested_service="صورة اشعة"
- "بدي الغي" → appointment_cancellation
- "بدي اغير موعدي" → appointment_reschedule
- "بدي احكي مع موظفة" → human_handoff
- "عندي تورم كبير وصعوبة بالتنفس" → urgent_signal
- "وين العيادة؟" → clinic_information
- "قديش سعر التنظيف؟" → service_information (when pricing context) OR clinic_information
- "شكرا" → goodbye

Message:`;

/**
 * Robustly extract a JSON object from an LLM response.
 *
 * The classifier asks the model for a single JSON object, but real models wrap
 * it in ```json fences, add prose, or emit a trailing comma — any of which made
 * a bare `JSON.parse` throw (production logs showed "Expected ',' or '}' …").
 * This isolates the outermost `{...}` and, on a parse failure, retries after
 * stripping trailing commas / smart quotes. Returns the parsed object or null
 * (the caller then treats it exactly like the old parse failure → fast-path).
 */
function extractJson(text: string): Record<string, unknown> | null {
  // 1. Strip markdown fences (```json ... ``` or ``` ... ```).
  let clean = text.replace(/```(?:json)?/gi, '').trim();

  // 2. Isolate the outermost JSON object (handles leading/trailing prose).
  const braceMatch = clean.match(/\{[\s\S]*\}/);
  if (braceMatch) clean = braceMatch[0];

  // 3. First attempt: parse as-is.
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    /* fall through to repair */
  }

  // 4. Repair common slips: trailing commas, and curly quotes the model
  //    sometimes emits inside string values, then retry once.
  const repaired = clean
    .replace(/,\s*([}\]])/g, '$1')          // trailing commas before } or ]
    .replace(/[“”]/g, '"')                   // smart double quotes → "
    .replace(/[‘’]/g, "'");                  // smart single quotes → '
  try {
    return JSON.parse(repaired) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Primary semantic intent classifier.
 *
 * Uses the LLM when available. Falls back to keyword rules only if:
 * - the LLM call fails/crashes
 * - the model is not configured
 *
 * @param text Patient message
 * @returns SemanticIntentResult or null if classifier unavailable (caller can fall back to keywords)
 */
export async function classifyIntentSemantic(text: string): Promise<SemanticIntentResult | null> {
  let provider;
  try {
    provider = getProvider();
  } catch {
    return null;
  }

  if (!provider || !provider.generate) return null;

  const start = Date.now();
  try {
    const result = await provider.generate({
      prompt: `${CLASSIFIER_PROMPT}\n\n${text}`,
      maxTokens: 200,
      temperature: 0,
    });

    const took = Date.now() - start;

    // Robustly extract the JSON object (tolerates ```json fences, surrounding
    // prose, trailing commas and smart quotes — see extractJson).
    const content = result.text.trim();
    const parsed = extractJson(content) as Partial<SemanticIntentResult> | null;
    // The model returns LOWERCASE intent values per the prompt. Validate against
    // the value set — not the uppercase keys.
    if (!parsed || !parsed.intent || typeof parsed.intent !== 'string' || !VALID_INTENT_VALUES.has(parsed.intent)) {
      logEvent('intent_classifier_invalid_json', { took, text, intent: parsed?.intent, raw: content.slice(0, 300) }, 'error');
      return null;
    }

    logEvent('intent_classifier_llm_ok', { took, text, intent: parsed.intent, confidence: parsed.confidence ?? null });
    return {
      intent: parsed.intent as SemanticIntent,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      entities: parsed.entities ?? {},
      raw: parsed,
    };
  } catch (err) {
    const took = Date.now() - start;
    logEvent('intent_classifier_llm_failed', {
      took,
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
    return null;
  }
}

/**
 * Deterministic FAST-PATH fallback — only for:
 *  1. Very explicit obvious actions ("إلغاء" → cancellation, "بدي احجز" → booking)
 *  2. Emergency safety signals (difficulty breathing, severe swelling)
 * This does NOT replace the LLM classifier.
 *
 * IMPORTANT ROOT-CAUSE FIX: JavaScript `\b` word boundaries are defined by
 * `\w` = [A-Za-z0-9_] which is ASCII-only, so `\b(احجز)\b` could NEVER match
 * any Arabic text — the whole Arabic fast-path was dead. All boundaries below
 * therefore use Unicode letter/digit lookarounds, and common clitic-suffixed
 * verb forms (احجزلي، الغيلي…) are enumerated longest-first so agglutinated
 * Palestinian phrasings still match.
 */
const NO_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const NO_LETTER_AFTER = '(?![\\p{L}\\p{N}])';

/** Builds a pattern that matches any listed phrase with Unicode boundaries. */
function unicodePhrasePattern(phrases: string): RegExp {
  return new RegExp(`${NO_LETTER_BEFORE}(?:${phrases})${NO_LETTER_AFTER}`, 'iu');
}

// Safety net is intentionally broad (fail-safe): extra dialectal emergency
// phrasings only cause a deterministic handoff, never a missed emergency.
const EXACT_EMERGENCY = /صعوبة بالتنفس|صعوبة بالبلع|صعوبة التنفس|صعوبة البلع|مش قادر اتنفس|مش قادرة اتنفس|ما بقادر اتنفس|ما بقدر اتنفس|بتخنق|خنقه|خنقة|can't breathe|cannot breathe|can['’]t breathe|difficulty breathing|trouble breathing|swelling|تورم كبير|انتفاخ كبير|تورم شديد|نزيف|bleeding|swallow|صعوبة بلع|trouble swallowing|urgent|طوارئ/i;

const EXACT_CANCEL = unicodePhrasePattern('إلغاء|الغاء|الغي|الغيلي|الغيها|الغيلها|الغينه|الغيني|بطل الحجز|بطل موعدي|cancel|cancellation');
// Fast-path vocabulary is deliberately conservative: explicit booking verbs and
// self-contained service-request phrases only — never a bare service name (so
// "قديش سعر البانوراما؟" can never be short-circuited into a booking).
const EXACT_BOOKING = unicodePhrasePattern('احجزلي|احجزي|احجزنا|احجزها|احجزله|احجزهم|ابدي احجز|بدي احجز|بدي حجز|بدي موعد|اريد حجز|أريد حجز|حجز موعد|احجز|بدي اتصور|بديتصور|أتصور|بدي تصوير|اريد تصوير|أريد تصوير|بدي اعمل تصوير|بدي صورة|صورة اشعة|صورة أشعة|book|booking|appointment');
const EXACT_RESCHEDULE = unicodePhrasePattern('تأجيل الموعد|تاجيل الموعد|تغيير الموعد|تعديل الموعد|بدي اغير موعدي|بدي أغير موعدي|بدي اجدد موعدي|بدي أجدد موعدي|reschedule|change appointment');
const EXACT_HANDOFF = unicodePhrasePattern('بدي احكي مع موظفة|بدي احكي مع موظف|بدي احكي مع الدكتور|بدي حدى من العيادة|بدي حدا من العيادة|مش فاهم|مش فاهمة|human|agent|staff|call me');
const CLEAR_BOOKING_REQUEST = /(?:^|[\s،,])(?:بدي\s+(?:احجز|حجز|موعد|اتصور|تصوير|اعمل\s+تصوير|صورة)|(?:أريد|اريد)\s+(?:احجز|حجز|موعد|تصوير)|احجز(?:لي|لنا)?(?:\s+موعد)?|book\s+me|i\s+(?:want|need|would\s+like)\s+(?:to\s+book|an?\s+appointment)|(?:please\s+)?book\s+an?\s+appointment|make\s+an?\s+appointment|schedule\s+an?\s+appointment)(?:$|[\s،,.!?؟])/i;
const NEGATED_BOOKING_REQUEST = /(?:مش|مو|ما|لا|لن)\s+(?:بدي|اريد|أريد|احجز|حجز)|(?:don't|do not|not)\s+(?:want\s+to\s+)?book/i;
const SHORT_AFFIRMATIVE_REPLY = /^(?:نعم|اجل|اي|اه|اكيد|اكد|موافق|موافقة|اوافق|تمام|حسنا|yes|yep|yeah|ok|okay|sure)[.!؟،\s]*$/i;
// Explicit operational questions can be answered from clinic-scoped structured
// data without the semantic-classifier LLM or a knowledge-base retrieval.
const FAST_PRICE_INQUIRY = /(?:\b(?:price|pricing|cost|fee)\b|\bhow\s+much\b|\u0633\u0639\u0631|\u0627\u0644\u062a\u0643\u0644\u0641\u0629|\u0628\u0643\u0645|\u0642\u062f\u064a\u0634)/i;
const FAST_HOURS_INQUIRY = /(?:opening\s+hours|hours\s+of\s+operation|when\s+(?:do|does|are)\s+you\s+(?:open|close)|\u062f\u0648\u0627\u0645|\u0627\u0648\u0642\u0627\u062a\s+(?:\u0627\u0644)?\u0639\u0645\u0644|\u0633\u0627\u0639\u0627\u062a\s+(?:\u0627\u0644)?\u0639\u0645\u0644|\u0645\u062a\u0649\s+(?:\u0628\u062a)?(?:\u0641\u062a\u062d|\u0642\u0641\u0644|\u062a\u0633\u0643\u0631))/i;
const FAST_SERVICE_LIST = /(?:what\s+(?:services|treatments)\s+(?:do\s+you\s+offer|are\s+available)|list\s+(?:your\s+)?services|available\s+services|\u0634\u0648\s+(?:\u0627\u0644)?\u062e\u062f\u0645\u0627\u062a|\u0645\u0627\s+(?:\u0647\u064a\s+)?\u0627\u0644?\u062e\u062f\u0645\u0627\u062a|\u0627\u0644\u062e\u062f\u0645\u0627\u062a\s+\u0627\u0644\u0645\u062a\u0627\u062d\u0629)/i;
const FAST_CLINIC_CONTACT = /(?:clinic.{0,20}(?:phone|telephone|address|location|contact)|where\s+is\s+(?:the\s+)?clinic|\u0631\u0642\u0645\s+(?:\u0627\u0644)?(?:\u0647\u0627\u062a\u0641|\u062a\u0644\u0641\u0648\u0646)|\u0639\u0646\u0648\u0627\u0646\s+(?:\u0627\u0644)?\u0639\u064a\u0627\u062f\u0629|\u0645\u0648\u0642\u0639\s+(?:\u0627\u0644)?\u0639\u064a\u0627\u062f\u0629|\u0643\u064a\u0641\s+\u0627\u062a\u0648\u0627\u0635\u0644)/i;

function fastResult(
  intent: SemanticIntent,
  confidence: number,
  entities: SemanticIntentResult['entities'] = {},
  conversationIntent?: ConversationIntent,
): SemanticIntentResult {
  return { intent, confidence, entities, fastPath: true, ...(conversationIntent ? { conversationIntent } : {}) };
}

// A pure greeting/goodbye: phrase at the start, optionally followed by
// punctuation/whitespace ONLY — "مرحبا بدي احجز" must NOT be a greeting.
const EXACT_GREETING = new RegExp(`^${NO_LETTER_BEFORE}(مرحبا|مرحبة|اهلا|أهلا|اهلين|أهلين|صباح الخير|مساء الخير|مساء النور|هاي|هلا|سلام|hello|hi|hey)${NO_LETTER_AFTER}[\\s،,.!؟?:؛~]*$`, 'iu');
const EXACT_GOODBYE = new RegExp(`^${NO_LETTER_BEFORE}(شكرا|شكراً|يسلمو|يسلموو|مع السلامة|باي|بايباي|bye|goodbye|thanks|thank you)${NO_LETTER_AFTER}[\\s،,.!؟?:؛~]*$`, 'iu');

// Leading greeting: a greeting word at the START, optionally followed by SHORT
// courtesy/reciprocal words ONLY ("كيفك", "كيف الحال", "شو في", "مرحبا كيفك",
// "شكراً كتير") and/or trailing punctuation ("كيفك؟", "مرحبا!"). A trailing
// booking/question/booking-verb/word immediately ends the fast-path (returns
// null → the LLM classifies it), so "مرحبا بدي أحجز" and "السلام عليكم بدي
// أسأل" are NEVER short-circuited. The leading "[،,.!؟?:؛~]" alternative accepts
// punctuation attached directly to the word with no space (the whitespace-required
// courtesy branch alone could never consume "كيفك؟"). Keeps greetings off the
// expensive LLM intent call without ever mis-reading a real request.
const LEADING_GREETING = new RegExp(
  `^${NO_LETTER_BEFORE}(?:السلام عليكم|سلام عليكم|مرحبا|مرحبة|اهلا|أهلا|أهلاً|اهلين|أهلين|صباح الخير|مساء الخير|مساء النور|هاي|هلا|hello|hi|hey|كيفك|كيف حالك|كيف الحال)`
  + `(?:[،,.!؟?:؛~]|\\s+(?:عليكم|وعليكم السلام|كيفك|كيفك؟|كيف حالك|كيف الحال|شو في|وش في|أخبارك|عامل|شو أخبارك|كيف|there|شو)[\\s،,.!؟?:؛~]*)*$`,  'iu',
);
const LEADING_GOODBYE = new RegExp(
  `^${NO_LETTER_BEFORE}(?:شكرا|شكراً|يسلمو|يسلموو|مع السلامة|باي|بايباي|thank you|thanks|bye|goodbye)`
  + `(?:[،,.!؟?:؛~]|\\s+(?:كتير|كثير|جزيلا|جزيلاً|لك|لكم|حبيبي|يعطيك العافية)[\\s،,.!؟?:؛~]*)*$`,
  'iu',
);

/**
 * STEP 12A-FIX — explicit service desire extraction (deterministic, no LLM).
 *
 * Levantine patients request a service with a desire verb ("بدي / أريد / بدي
 * أعمل / بدي اتصور …"). ONLY such explicit desires are extracted: a bare
 * medical mention ("هل الأشعة خطيرة؟", "الدكتور طلب مني أشعة") is NOT a booking
 * desire and must return null.
 *
 * This is the deterministic half of the unified booking path: the public
 * "request service" page always books a service chosen from the real catalog,
 * so the chat path must resolve the same catalog entry from the patient's own
 * words instead of depending on the model to store `recommended_service_id`.
 */
const SERVICE_DESIRE = /(?:بدي|بتي|أريد|اريد|ريد|حابب|حابة|حاب|محتاج|محتاجة|بتمنى|want|need|i'?d like)\s+(?:أعمل|اعمل|أخذ|اخذ|آخذ|أجرة|اجرة|أصور|اصور|أتصور|اتصور|احجز|أحجز|حجز|احجزي|احجزلي|أحجزلي)?\s*/i;

/** Trailing/contextual tokens that are NOT part of a service name. */
const SERVICE_STOPWORDS = new Set([
  'أسنان', 'اسنان', 'الأسنان', 'الاسنان', 'أسناني', 'اسناني', 'سن', 'ضرس',
  'الفم', 'للفم', 'عند', 'مع', 'من', 'في', 'على', 'عن', 'عندكم', 'لـ', 'ل',
  'يوم', 'اليوم', 'بكرة', 'بكرا', 'غدا', 'غداً', 'بعد', 'قبل', 'بتاريخ',
  'الساعة', 'الساعه', 'صباحا', 'صباحاً', 'مساء', 'مساءً', 'ظهرا', 'ظهراً',
  'الأحد', 'الاحد', 'الاثنين', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الاربعاء',
  'الخميس', 'الجمعة', 'السبت', 'بس', 'لو', 'هل', 'شو', 'كم', 'قديش',
  'موعد', 'حجز', 'احجز', 'أحجز', 'احجزي', 'احجزلي',
]);

export function extractRequestedServiceFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const desire = SERVICE_DESIRE.exec(text.trim());
  if (!desire) return null;
  const rest = text.slice(desire.index + desire[0].length).trim();
  if (!rest) return null;

  const words: string[] = [];
  for (const rawWord of rest.split(/\s+/)) {
    const word = rawWord.replace(/^[،,.\-:!؟?"'()]+|[،,.\-:!؟?"'()]+$/g, '');
    if (!word || /^\d+$/.test(word)) break;
    if (SERVICE_STOPWORDS.has(word)) break;
    words.push(word);
    if (words.length >= 3) break;
  }

  if (words.length === 0) return null;
  const service = words.join(' ').trim();
  return service.length >= 2 ? service : null;
}

export function classifyIntentFastPath(text: string): SemanticIntentResult | null {
  const t = text.trim();

  if (EXACT_EMERGENCY.test(t)) {
    return fastResult(SEMANTIC_INTENTS.URGENT_SIGNAL, 0.98, { urgency: 'critical' });
  }
  if (EXACT_CANCEL.test(t)) return fastResult(SEMANTIC_INTENTS.APPOINTMENT_CANCELLATION, 0.95);
  if (EXACT_RESCHEDULE.test(t)) return fastResult(SEMANTIC_INTENTS.APPOINTMENT_RESCHEDULE, 0.9);
  if (EXACT_BOOKING.test(t)) return fastResult(SEMANTIC_INTENTS.APPOINTMENT_BOOKING, 0.85);
  if (EXACT_HANDOFF.test(t)) return fastResult(SEMANTIC_INTENTS.HUMAN_HANDOFF, 0.95);
  if (EXACT_GREETING.test(t)) return fastResult(SEMANTIC_INTENTS.GREETING, 0.9);
  if (EXACT_GOODBYE.test(t)) return fastResult(SEMANTIC_INTENTS.GOODBYE, 0.9);
  // Leading greeting/goodbye ("مرحبا كيفك", "شكراً كتير") — safe because a
  // trailing booking/question word falls through to the LLM (see LEADING_*).
  if (LEADING_GREETING.test(t)) return fastResult(SEMANTIC_INTENTS.GREETING, 0.85);
  if (LEADING_GOODBYE.test(t)) return fastResult(SEMANTIC_INTENTS.GOODBYE, 0.85);

  if (FAST_PRICE_INQUIRY.test(t)) {
    return fastResult(SEMANTIC_INTENTS.SERVICE_INFORMATION, 0.9, {}, 'pricing_inquiry');
  }
  if (FAST_HOURS_INQUIRY.test(t)) {
    return fastResult(SEMANTIC_INTENTS.CLINIC_INFORMATION, 0.9, {}, 'clinic_hours');
  }
  if (FAST_SERVICE_LIST.test(t)) {
    return fastResult(SEMANTIC_INTENTS.SERVICE_INFORMATION, 0.85, {}, 'services_inquiry');
  }
  if (FAST_CLINIC_CONTACT.test(t)) {
    return fastResult(SEMANTIC_INTENTS.CLINIC_INFORMATION, 0.85, {}, 'location');
  }
  if (CLEAR_BOOKING_REQUEST.test(t) && !NEGATED_BOOKING_REQUEST.test(t)) {
    return fastResult(SEMANTIC_INTENTS.APPOINTMENT_BOOKING, 0.9);
  }

  const normalizedShortReply = t
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670ـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLowerCase();
  if (SHORT_AFFIRMATIVE_REPLY.test(normalizedShortReply)) {
    return fastResult(SEMANTIC_INTENTS.UNKNOWN, 0.8);
  }

  return null;
}

/**
 * Orchestrates semantic classification: emergency safety signals first,
 * then the LLM as PRIMARY, then the deterministic fast-path as a fallback
 * when the LLM is unavailable, then a generic UNKNOWN.
 *
 * Ordering rationale (matches the documented design):
 *  - Emergency signals always short-circuit (safety, deterministic).
 *  - The LLM understands Arabic dialects/typos — it must see the message
 *    first so phrases like "متى أقرب موعد؟" are classified by MEANING
 *    (a question), not short-circuited by the keyword "موعد".
 *  - The keyword fast-path remains as an offline fallback only.
 */
export async function classifyIntent(text: string): Promise<SemanticIntentResult> {
  // 0. Emergency safety signals — always deterministic and first.
  if (EXACT_EMERGENCY.test(text.trim())) {
    return fastResult(SEMANTIC_INTENTS.URGENT_SIGNAL, 0.98, { urgency: 'critical' });
  }

  // 0b. Small-talk and explicit operational questions resolve deterministically
  // before the LLM. They can be answered from structured clinic data, and a
  // classifier round-trip adds latency without improving these unambiguous asks.
  const fastSmallTalk = classifyIntentFastPath(text);
  const fastOperationalIntent = ['pricing_inquiry', 'clinic_hours', 'services_inquiry', 'location']
    .includes(fastSmallTalk?.conversationIntent ?? '');
  if (
    fastSmallTalk &&
    (fastSmallTalk.intent === SEMANTIC_INTENTS.GREETING ||
      fastSmallTalk.intent === SEMANTIC_INTENTS.GOODBYE ||
      fastOperationalIntent ||
      (fastSmallTalk.intent === SEMANTIC_INTENTS.APPOINTMENT_BOOKING &&
        CLEAR_BOOKING_REQUEST.test(text.trim()) && !NEGATED_BOOKING_REQUEST.test(text.trim())) ||
      (fastSmallTalk.intent === SEMANTIC_INTENTS.UNKNOWN && fastSmallTalk.fastPath === true))
  ) {
    return fastSmallTalk;
  }

  // 1. Primary semantic (LLM).
  const semantic = await classifyIntentSemantic(text);
  if (semantic) return semantic;

  // 2. Deterministic fast-path fallback when the LLM is unavailable.
  const fast = classifyIntentFastPath(text);
  if (fast) return fast;

  // 3. Fallback to unknown — orchestrator will handle it conversationally.
  return { intent: SEMANTIC_INTENTS.UNKNOWN, confidence: 0.2, entities: {} };
}

export function intentLabel(intent: SemanticIntent): string {
  return intent;
}
