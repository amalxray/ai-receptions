import { describe, expect, it } from 'vitest';
import { validatePublicContactValue } from '@/components/dashboard/clinic/PublicPageManager';
import { buildPublicWhatsAppHref } from '@/lib/utils/whatsapp';

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

  it('builds working links from local and international phone formats', () => {
    expect(buildPublicWhatsAppHref('0599 509 093')).toBe('https://wa.me/970599509093');
    expect(buildPublicWhatsAppHref('970599509093')).toBe('https://wa.me/970599509093');
    expect(buildPublicWhatsAppHref('+970 (599) 509-093')).toBe('https://wa.me/970599509093');
    expect(buildPublicWhatsAppHref('not a phone number')).toBeNull();
    expect(buildPublicWhatsAppHref(null)).toBeNull();
  });

  it('preserves supported full WhatsApp links', () => {
    const waMeUrl = 'https://wa.me/970599509093?text=hello';
    const apiUrl = 'https://api.whatsapp.com/send?phone=970599509093';

    expect(buildPublicWhatsAppHref(waMeUrl)).toBe(waMeUrl);
    expect(buildPublicWhatsAppHref(apiUrl)).toBe(apiUrl);
  });
});
