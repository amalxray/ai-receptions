import { describe, expect, it } from 'vitest';
import { validatePublicContactValue } from '@/components/dashboard/clinic/PublicPageManager';

describe('public page contact validation', () => {
  it('keeps email and website separate and validates them independently', () => {
    expect(validatePublicContactValue('email', 'amalxraycenter@gmail.com')).toBeNull();
    expect(validatePublicContactValue('email', 'not-an-email')).toBe('يرجى إدخال بريد إلكتروني صحيح');
    expect(validatePublicContactValue('website', 'https://maps.app.goo.gl/abc')).toBeNull();
    expect(validatePublicContactValue('website', 'maps.app.goo.gl/abc')).toBe('يرجى إدخال رابط صحيح يبدأ بـ http:// أو https://');
  });
});
