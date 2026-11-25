export const WHATSAPP_COUNTRY_CALLING_CODES: Record<string, string> = {
  PS: '970',
  JO: '962',
  SA: '966',
  AE: '971',
  KW: '965',
  QA: '974',
  BH: '973',
  OM: '968',
  EG: '20',
  LB: '961',
  SY: '963',
  IQ: '964',
  YE: '967',
  SD: '249',
  LY: '218',
  TN: '216',
  DZ: '213',
  MA: '212',
  US: '1',
  CA: '1',
  GB: '44',
  UK: '44',
  DE: '49',
  FR: '33',
  CN: '86',
  RU: '7',
  TR: '90',
};

export type WhatsAppPhoneWarning = 'no-phone' | 'israeli-number' | 'other-country';

export function getWhatsAppPhoneWarning(
  phone: string | null | undefined,
  country: string,
): WhatsAppPhoneWarning | null {
  const trimmedPhone = phone?.trim();
  if (!trimmedPhone) return 'no-phone';

  const countryCode = country.trim().toUpperCase();
  const expectedCallingCode = WHATSAPP_COUNTRY_CALLING_CODES[countryCode];
  const normalized = trimmedPhone.replace(/[^\d+]/g, '');
  const hasInternationalPrefix = normalized.startsWith('+') || normalized.startsWith('00');
  const internationalDigits = normalized.startsWith('+')
    ? normalized.slice(1)
    : normalized.startsWith('00')
      ? normalized.slice(2)
      : '';

  if (internationalDigits.startsWith('972')) return 'israeli-number';

  if (hasInternationalPrefix) {
    if (expectedCallingCode) {
      return internationalDigits.startsWith(expectedCallingCode) ? null : 'other-country';
    }

    const knownForeignPrefixes = ['1', '7', '20', '33', '44', '49', '86', '90', '212', '213', '216', '218'];
    return knownForeignPrefixes.some((prefix) => internationalDigits.startsWith(prefix))
      ? 'other-country'
      : null;
  }

  const digits = normalized.replace(/\D/g, '');
  const isNorthAmericanWithCountryPrefix = /^1[\s().-]*[2-9]\d{2}[\s().-]*[2-9]\d{2}[\s().-]*\d{4}$/.test(trimmedPhone);
  if (isNorthAmericanWithCountryPrefix && countryCode !== 'US' && countryCode !== 'CA') {
    return 'other-country';
  }

  return null;
}

/**
 * Converts a phone number into wa.me-compatible digits. Palestinian local
 * numbers use +970 by default; international numbers keep their country code.
 */
export function normalizePhoneForWhatsApp(
  phone?: string | null,
  defaultCountryCode = '970'
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+')) {
    const clean = digits.slice(1);
    return clean.length >= 8 ? clean : null;
  }
  if (digits.startsWith('00')) {
    const clean = digits.slice(2);
    return clean.length >= 8 ? clean : null;
  }
  if (digits.startsWith('0')) {
    const clean = `${defaultCountryCode}${digits.replace(/^0+/, '')}`;
    return clean.length >= 10 ? clean : null;
  }
  return digits.length >= 8 ? digits : null;
}

export function buildWhatsAppHref(
  phone: string | null | undefined,
  message: string,
  defaultCountryCode = '970',
): string | null {
  const target = normalizePhoneForWhatsApp(phone, defaultCountryCode);
  if (!target) return null;
  const text = message.trim();
  return text ? `https://wa.me/${target}?text=${encodeURIComponent(text)}` : `https://wa.me/${target}`;
}

/** Returns a safe WhatsApp link for a saved phone number or supported URL. */
export function buildPublicWhatsAppHref(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(trimmed)) return trimmed;

  const phone = normalizePhoneForWhatsApp(trimmed);
  return phone ? `https://wa.me/${phone}` : null;
}
