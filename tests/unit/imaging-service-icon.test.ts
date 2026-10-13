import { describe, it, expect } from 'vitest';
import { imagingServiceIcon } from '@/components/public/ImagingPublicSpace';

/**
 * imagingServiceIcon — name-first mapping so a service mis-filed under a
 * generic modality still shows the right icon (regression: "مفصل الفكين" was
 * stored as `cbct` and rendered the CBCT x-ray 🩻 instead of the bone 🦴).
 */
describe('imagingServiceIcon', () => {
  it('shows the bone icon for TMJ / مفصل by name, regardless of stored modality', () => {
    expect(imagingServiceIcon('مفصل الفكين', 'cbct')).toBe('🦴');
    expect(imagingServiceIcon('تصوير مفصل الفك', 'cbct')).toBe('🦴');
    expect(imagingServiceIcon('TMJ imaging', 'cbct')).toBe('🦴');
    expect(imagingServiceIcon('مفصل الفكين', 'tmj')).toBe('🦴');
  });

  it('keeps modality icons for genuine modalities', () => {
    expect(imagingServiceIcon('تصوير بانوراما', 'panoramic')).toBe('🦷');
    expect(imagingServiceIcon('تصوير طبقي cbct', 'cbct')).toBe('🩻');
  });

  it('does not let other services accidentally match the مفصل rule', () => {
    // A normal dental service must NOT become a bone icon.
    expect(imagingServiceIcon('تنظيف الأسنان', 'panoramic')).toBe('🦷');
    expect(imagingServiceIcon('فحص عام', null)).not.toBe('🦴');
  });

  it('falls back to a rotating decorative glyph for unknown modalities', () => {
    expect(imagingagingSafeIconFallback()).toBe(true);
  });
});

// helper kept inline to avoid importing internal arrays
function imagingagingSafeIconFallback(): boolean {
  const first = imagingServiceIcon('خدمة غير معروفة', null, 0);
  const second = imagingServiceIcon('خدمة غير معروفة', null, 1);
  const third = imagingServiceIcon('خدمة غير معروفة', null, 2);
  return ['📷', '✨', '🔬'].includes(first)
    && ['📷', '✨', '🔬'].includes(second)
    && ['📷', '✨', '🔬'].includes(third)
    && first !== '🦴';
}
