/**
 * Medical-language filter for patient reviews — PURE function, no I/O.
 * Arabic normalization (tashkeel/alef/ta-marbuta) then bounded rules.
 * flagged=true means: NEVER auto-published (Hybrid publishing decision).
 */

export type MedicalReviewFilterResult = { flagged: boolean; reason: string | null };

/** Strip tashkeel + tatweel, unify alef/hamza, ى→ي, ة→ه, lowercase. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FORBIDDEN_TERMS: Array<{ id: string; label: string; terms: string[] }> = [
  { id: 'healing_claim', label: 'ادعاء شفاء طبي',
    terms: ['شفيت', 'شفاني', 'تعالجت', 'عالجني'] },              // "برايت" محذوف (اسم خدمة)
  { id: 'symptom', label: 'ذكر ألم أو عرض',
    terms: ['ألم', 'وجع', 'نزيف', 'تورم'] },
  { id: 'diagnosis', label: 'تشخيص طبي',
    terms: ['تشخيص', 'شخّص', 'وصفة', 'جرعة'] },
];

/** "د. علي" / "دكتور" / "الدكتور" + كلمة مدح لاحقة في النص. */
const DOCTOR_TITLE = /(^|[^ا-ي])(ال)?د(\s*[.،]\s*|[ا-ي]{3,9})/;
const PRAISE_WORDS = ['ممتاز', 'رائع', 'الافضل', 'الاجمل', 'شكرا'];

export function filterMedicalReview(text: string | null | undefined): MedicalReviewFilterResult {
  const raw = (text ?? '').trim();
  if (!raw) return { flagged: false, reason: null };
  const norm = normalizeArabic(raw);

  for (const rule of FORBIDDEN_TERMS) {
    for (const term of rule.terms) {
      const t = normalizeArabic(term);
      // مصطلح قصير (≤4): كلمة كاملة + بادئة «ال» اختيارية كمجموعة —
      // (الألم/ألم → "الالم"/"الم"). لاحظ: `ال?` تعني 'ا' مطلوب+'ل' اختياري!
      const pattern =
        t.length <= 4
          ? new RegExp(`(^|[^ا-ي])(?:ال)?${escapeRegExp(t)}([^ا-ي]|$)`)
          : new RegExp(escapeRegExp(t));
      if (pattern.test(norm)) return { flagged: true, reason: rule.label };
    }
  }

  const praised = PRAISE_WORDS.some(
    (word) => new RegExp(`(^|[^ا-ي])${word}([^ا-ي]|$)`).test(norm),
  );
  if (DOCTOR_TITLE.test(norm) && praised) {
    return { flagged: true, reason: 'ذكر طبيب بالتقييم' };
  }
  return { flagged: false, reason: null };
}

/* ─────────────── PII: أرقام هواتف (لاتيني + عربي-هندي) على النص الأصلي ─────────────── */
const PHONE_PATTERNS = [
  /\+?970[0-9٠-٩]{8,9}/g,                                // +97059… / 97059…
  /\+?[0-9٠-٩]{9,}/g,                                    // متصل ≥9: 0599123456 / ٠٥٩٢٧٠١٠٧٧
  // مجزأ ≥9 أرقام: 059-270-1077 / ٠٥٩ ٢٧٠ ١٠٧٧.
  // {8,11} تكراراً بعد الصفر = إجمالي 9-12 رقماً — يمنع مطابقة
  // التواريخ (2026-10-26 = 8 أرقام فقط → سليمة).
  /[0٠](?:[\s\-]?[0-9٠-٩]){8,11}(?![0-9٠-٩\-])/g,
];

export function sanitizePII(text: string): string {
  let clean = text; // النص الأصلي — بلا تطبيع عام للأرقام
  for (const p of PHONE_PATTERNS) {
    clean = clean.replace(p, '[***]');
  }
  return clean;
}