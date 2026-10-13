import { describe, it, expect } from 'vitest';
import { classifyActivity } from '@/lib/services/askActivityIntent';

/**
 * classifyActivity — /ask service→activity mapping (booking-independent).
 *
 * Guarantees the single-activity narrowing a patient expects:
 *   - imaging request (بانوراما / أشعة / طبقي / CBCT) → imaging_center ONLY
 *   - dental practice request (خلع / زراعة / تنظيف / حشو) → clinic ONLY
 *   - lab work (مختبر / تاج / جسر / طقم) → dental_lab ONLY
 *   - no clear service intent → null (caller keeps "all types" behaviour)
 */
describe('classifyActivity', () => {
  it('maps imaging keywords to imaging_center', () => {
    expect(classifyActivity('بدي صورة طبقية')).toBe('imaging_center');
    expect(classifyActivity('أريد تصوير بانوراما')).toBe('imaging_center');
    expect(classifyActivity('عندي أشعة أسنان')).toBe('imaging_center');
    expect(classifyActivity('محتاج CBCT')).toBe('imaging_center');
    expect(classifyActivity('I need an x-ray')).toBe('imaging_center');
  });

  it('treats the present-tense verb "اصور" as imaging, not clinic', () => {
    // Regression: "بدي اصور اسناني" must NOT be swallowed by the clinic "سن".
    expect(classifyActivity('بدي اصور اسناني في موقع قريب')).toBe('imaging_center');
  });

  it('keeps an earlier imaging intent across a generic location turn', () => {
    // The next turn ("الموقع تم تحديدد…") has no service word on its own.
    expect(
      classifyActivity('الموقع تم تحديده، اقترح لي أقرب المراكز', ['بدي اصور اسناني']),
    ).toBe('imaging_center');
  });

  it('maps clinic keywords to clinic', () => {
    expect(classifyActivity('بدي خلع ضرس')).toBe('clinic');
    expect(classifyActivity('أريد زراعة أسنان')).toBe('clinic');
    expect(classifyActivity('تنظيف الأسنان')).toBe('clinic');
    expect(classifyActivity('عندي حشو مكسور')).toBe('clinic');
  });

  it('maps lab keywords to dental_lab', () => {
    expect(classifyActivity('بدي تركيب تاج')).toBe('dental_lab');
    expect(classifyActivity('مختبر أسنان')).toBe('dental_lab');
    expect(classifyActivity('أطقم أسنان')).toBe('dental_lab');
  });

  it('returns null when there is no clear service intent', () => {
    expect(classifyActivity('مرحبا')).toBeNull();
    expect(classifyActivity('كيف حالك')).toBeNull();
    expect(classifyActivity('')).toBeNull();
  });

  it('prefers imaging when a message mixes imaging + clinic words', () => {
    // "صورة للأسنان" is imaging, not a cleaning/extraction clinic visit.
    expect(classifyActivity('صورة أشعة لضرسي')).toBe('imaging_center');
  });
});
