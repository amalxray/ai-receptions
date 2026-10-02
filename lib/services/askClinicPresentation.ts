/** Replace technical demo identifiers with a neutral Arabic label in public cards. */
export function displayAskClinicName(name: string, activityType?: string | null): string {
  const trimmed = name.trim();
  if (trimmed && !/^[a-z0-9-]+$/i.test(trimmed) && !trimmed.includes('-')) return trimmed;
  return activityType === 'imaging_center' ? 'مركز طبي' : 'عيادة شريكة';
}

export type AskConversationMessage = { role: 'user' | 'assistant'; content: string };

/** Collapse repeated patient reviews by either author or normalized text. */
export function dedupeAskTestimonials<T extends Record<string, unknown>>(items: T[]): T[] {
  const seenNames = new Set<string>();
  const seenContent = new Set<string>();

  return items.filter((item) => {
    const name = typeof item.patient_name === 'string' ? item.patient_name.trim().toLocaleLowerCase() : '';
    const content = typeof item.content === 'string'
      ? item.content.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
      : '';
    if (!name && !content) return false;
    if ((name && seenNames.has(name)) || (content && seenContent.has(content))) return false;
    if (name) seenNames.add(name);
    if (content) seenContent.add(content);
    return true;
  });
}