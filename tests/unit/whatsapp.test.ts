import { describe, expect, it } from 'vitest';
import { getWhatsAppPhoneWarning } from '@/lib/utils/whatsapp';

describe('getWhatsAppPhoneWarning', () => {
  it('explains why a phone cannot be contacted through WhatsApp', () => {
    expect(getWhatsAppPhoneWarning(null, 'JO')).toBe('no-phone');
    expect(getWhatsAppPhoneWarning('+972 59 123 4567', 'PS')).toBe('israeli-number');
    expect(getWhatsAppPhoneWarning('+1-646-484-0197', 'JO')).toBe('other-country');
    expect(getWhatsAppPhoneWarning('+44 20 7946 0100', 'JO')).toBe('other-country');
    expect(getWhatsAppPhoneWarning('+49 30 123456', 'JO')).toBe('other-country');
    expect(getWhatsAppPhoneWarning('+33 1 23 45 67 89', 'JO')).toBe('other-country');
    expect(getWhatsAppPhoneWarning('+86 10 1234 5678', 'JO')).toBe('other-country');
  });

  it('allows matching international and local numbers', () => {
    expect(getWhatsAppPhoneWarning('+962 79 123 4567', 'JO')).toBeNull();
    expect(getWhatsAppPhoneWarning('+970 59 123 4567', 'PS')).toBeNull();
    expect(getWhatsAppPhoneWarning('+966 55 123 4567', 'SA')).toBeNull();
    expect(getWhatsAppPhoneWarning('+971 50 123 4567', 'AE')).toBeNull();
    expect(getWhatsAppPhoneWarning('+20 2 5555 0100', 'EG')).toBeNull();
    expect(getWhatsAppPhoneWarning('0791234567', 'JO')).toBeNull();
    expect(getWhatsAppPhoneWarning('0591234567', 'PS')).toBeNull();
    expect(getWhatsAppPhoneWarning('+962 79 123 4567', 'PS')).toBe('other-country');
  });
});
