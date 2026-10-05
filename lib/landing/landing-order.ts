export function normalizeLandingPageOrder(order: string[], allowedKeys: readonly string[]): string[] {
  const allowed = new Set(allowedKeys);
  const unknown = order.filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`مفاتيح أقسام غير معروفة: ${Array.from(new Set(unknown)).join(', ')}`);
  }

  const uniqueOrder = Array.from(new Set(order));
  return [...uniqueOrder, ...allowedKeys.filter((key) => !uniqueOrder.includes(key))];
}

export function describeLandingOrderDatabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);

  const record = error as Record<string, unknown>;
  const rawMessage = record.message;
  const message = typeof rawMessage === 'string'
    ? rawMessage
    : rawMessage === undefined
      ? ''
      : JSON.stringify(rawMessage);
  const code = typeof record.code === 'string' ? record.code : '';
  const details = typeof record.details === 'string' ? record.details : '';
  const hint = typeof record.hint === 'string' ? record.hint : '';
  const name = typeof record.name === 'string' && record.name !== 'Error' ? record.name : '';
  const context = [message, code && `code=${code}`, details && `details=${details}`, hint && `hint=${hint}`]
    .filter(Boolean)
    .join(' — ');

  if (code === '42P01' || /relation .*landing_page_order.* does not exist|could not find the table .*landing_page_order/i.test(message)) {
    return `جدول landing_page_order غير موجود أو غير متاح. طبّق ترحيل db/migrations/20261004_landing_page_order.sql. ${context}`.trim();
  }

  return context || name || JSON.stringify(error);
}

export function getLandingOrderDatabaseErrorFields(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { error: String(error) };

  const record = error as Record<string, unknown>;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    message: record.message,
    code: record.code,
    details: record.details,
    hint: record.hint,
    status: record.status,
    statusText: record.statusText,
  };
}
