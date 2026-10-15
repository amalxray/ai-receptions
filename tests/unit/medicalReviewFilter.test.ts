import { describe, it, expect } from 'vitest';
import { filterMedicalReview, sanitizePII, normalizeArabic } from '@/lib/services/medicalReviewFilter';

describe('filterMedicalReview — Arabic medical rules', () => {
  it('1. ادعاء شفاء: "شفيت" → flagged', () => {
    expect(filterMedicalReview('شفيت بعد الجلسة')).toEqual({ flagged: true, reason: 'ادعاء شفاء طبي' });
  });

  it('2+3. التشكيل لا يمنع المطابقة: "شفيتُ" و"شَفيت"', () => {
    expect(filterMedicalReview('شفيتُ').flagged).toBe(true);
    expect(filterMedicalReview('شَفيت').flagged).toBe(true);
  });

  it('4. "تعالجت عنده" → flagged', () => {
    expect(filterMedicalReview('تعالجت عنده')).toEqual({ flagged: true, reason: 'ادعاء شفاء طبي' });
  });

  it('5. "الألم راح" → flagged (كلمة كاملة + بادئة ال)', () => {
    expect(filterMedicalReview('الألم راح')).toEqual({ flagged: true, reason: 'ذكر ألم أو عرض' });
  });

  it('6. "معلومة" → NOT flagged (لا مطابقة جزئية)', () => {
    expect(filterMedicalReview('المكان فيه معلومة')).toEqual({ flagged: false, reason: null });
  });

  it('7. "الدكتور أحمد ممتاز" → flagged (doctor praise)', () => {
    expect(filterMedicalReview('الدكتور أحمد ممتاز')).toEqual({ flagged: true, reason: 'ذكر طبيب بالتقييم' });
  });

  it('8. "د. علي رائع" → flagged (doctor praise)', () => {
    expect(filterMedicalReview('د. علي رائع')).toEqual({ flagged: true, reason: 'ذكر طبيب بالتقييم' });
  });

  it('9. "استقبال سريع" → NOT flagged', () => {
    expect(filterMedicalReview('استقبال سريع')).toEqual({ flagged: false, reason: null });
  });

  it('10. "المكان نظيف" → NOT flagged', () => {
    expect(filterMedicalReview('المكان نظيف')).toEqual({ flagged: false, reason: null });
  });

  it('11+12. سلسلة فارغة و null → NOT flagged', () => {
    expect(filterMedicalReview('')).toEqual({ flagged: false, reason: null });
    expect(filterMedicalReview(null)).toEqual({ flagged: false, reason: null });
  });

  it('19. "الدكتور محترف" (بلا مدح) → NOT flagged', () => {
    expect(filterMedicalReview('الدكتور محترف')).toEqual({ flagged: false, reason: null });
  });

  it('20. "برايت" (اسم خدمة — محذوف) → NOT flagged', () => {
    expect(filterMedicalReview('جربت خدمة البرايت')).toEqual({ flagged: false, reason: null });
  });
});

describe('sanitizePII — phones (latin + arabic-indic digits)', () => {
  it('13. "0599123456" → "[***]"', () => {
    expect(sanitizePII('0599123456')).toBe('[***]');
  });

  it('14. "٠٥٩٢٧٠١٠٧٧" → "[***]"', () => {
    expect(sanitizePII('٠٥٩٢٧٠١٠٧٧')).toBe('[***]');
  });

  it('15. "اتصلوا بي على 059-270-1077" → الرقم مُستبدل في النص الأصلي', () => {
    expect(sanitizePII('اتصلوا بي على 059-270-1077')).toBe('اتصلوا بي على [***]');
  });

  it('16. "2026-10-26" → بلا تغيير (تواريخ قصيرة ليست هواتف)', () => {
    expect(sanitizePII('2026-10-26')).toBe('2026-10-26');
  });

  it('17. "+970599123456" → "[***]"', () => {
    expect(sanitizePII('+970599123456')).toBe('[***]');
  });
});

describe('normalizeArabic — letter unification', () => {
  it('18. إ = ا = أ', () => {
    expect(normalizeArabic('إ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('أ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('آ')).toBe(normalizeArabic('ا'));
  });
});