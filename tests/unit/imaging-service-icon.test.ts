import { describe, it, expect } from 'vitest';
import { imagingServiceIcon, imagingServiceImage } from '@/components/public/ImagingPublicSpace';

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

describe('imagingServiceImage', () => {
  it('maps service names to the matching public image before modality fallback', () => {
    expect(imagingServiceImage('مفصل الفكين', 'cbct')?.src).toBe('/teeth-pic/tmj-pain.jpeg');
    expect(imagingServiceImage('تصوير طبقي cbct', 'panoramic')?.src).toBe('/teeth-pic/cbct-3d.jpg');
    expect(imagingServiceImage('تصوير بانوراما', 'cbct')?.src).toBe('/teeth-pic/panorama.png');
  });

  it('uses modality for generic service names and leaves unknown services without an image', () => {
    expect(imagingServiceImage('تصوير ثلاثي الأبعاد', 'cbct')?.src).toBe('/teeth-pic/cbct-3d.jpg');
    expect(imagingServiceImage('فحص عام', null)).toBeNull();
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
