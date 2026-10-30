export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s-]/g, '');

  if (compact.startsWith('+970')) return `0${compact.slice(4)}`;
  if (compact.startsWith('00970')) return `0${compact.slice(5)}`;
  if (compact.startsWith('970')) return `0${compact.slice(3)}`;

  return compact;
}

export function phoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized.startsWith('0')) return [normalized];

  const nationalNumber = normalized.slice(1);
  return [
    normalized,
    `+970${nationalNumber}`,
    `00970${nationalNumber}`,
    `970${nationalNumber}`,
  ];
}