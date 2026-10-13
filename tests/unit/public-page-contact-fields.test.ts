import { describe, expect, it } from 'vitest';
import { validatePublicContactValue } from '@/components/dashboard/clinic/PublicPageManager';

describe('public page contact validation', () => {
  it('keeps email and website separate and validates them independently', () => {
    expect(validatePublicContactValue('email', 'amalxraycenter@gmail.com')).toBeNull();
    expect(validatePublicContactValue('email', 'not-an-email')).toBe('يرجى إدخال بريد إلكتروني صحيح');
    expect(validatePublicContactValue('website', 'https://maps.app.goo.gl/abc')).toBeNull();
    expect(validatePublicContactValue('website', 'maps.app.goo.gl/abc')).toBe('يرجى إدخال رابط صحيح يبدأ بـ http:// أو https://');
  });

  it('accepts a raw WhatsApp number or a wa.me link, rejects junk', () => {
    // raw numbers
    expect(validatePublicContactValue('whatsapp', '0569509093')).toBeNull();
    expect(validatePublicContactValue('whatsapp', '+970569509093')).toBeNull();
    expect(validatePublicContactValue('whatsapp', '970569509093')).toBeNull();
    // full wa.me / api.whatsapp.com links
    expect(validatePublicContactValue('whatsapp', 'https://wa.me/970569509093')).toBeNull();
    expect(validatePublicContactValue('whatsapp', 'https://api.whatsapp.com/970569509093')).toBeNull();
    // junk rejected
    expect(validatePublicContactValue('whatsapp', 'abc')).toBe('يرجى إدخال رقم واتساب أو رابط wa.me صحيح');
    expect(validatePublicContactValue('whatsapp', 'https://wa.me/abc')).toBe('يرجى إدخال رقم واتساب أو رابط wa.me صحيح');
  });
});
