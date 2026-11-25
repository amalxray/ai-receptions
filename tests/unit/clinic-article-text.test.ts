import { describe, expect, it } from 'vitest';
import {
  cleanClinicArticleTitle,
  clinicArticleExcerpt,
  stripClinicArticleMarkup,
} from '@/lib/services/clinicArticleText';

describe('clinic article text', () => {
  it('removes bold markers from public titles', () => {
    expect(cleanClinicArticleTitle('**رعاية __الأسنان__**')).toBe('رعاية الأسنان');
  });

  it('converts saved markup to safe readable text', () => {
    expect(stripClinicArticleMarkup('<p>العناية &amp; الوقاية</p><p>نص إضافي</p>')).toBe(
      'العناية & الوقاية\nنص إضافي'
    );
  });

  it('creates a short excerpt and handles empty content', () => {
    expect(clinicArticleExcerpt('معلومة مهمة '.repeat(20))).toHaveLength(151);
    expect(clinicArticleExcerpt(null)).toBe('محتوى توعوي من العيادة.');
  });
});
