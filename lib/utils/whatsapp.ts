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

/** Returns a safe WhatsApp link for a saved phone number or supported URL. */
export function buildPublicWhatsAppHref(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(trimmed)) return trimmed;

  const phone = normalizePhoneForWhatsApp(trimmed);
  return phone ? `https://wa.me/${phone}` : null;
}
