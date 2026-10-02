/** Replace technical clinic identifiers with an Arabic label in public surfaces. */
export function displayPublicClinicName(name: string, activityType?: string | null): string {
  const trimmed = name.trim();
  if (trimmed && !trimmed.includes('-') && !/^[a-z0-9\s]+$/i.test(trimmed)) return trimmed;
  return activityType === 'imaging_center' ? 'مركز طبي' : 'عيادة شريكة';
}

/** Backwards-compatible name used by the /ask cards. */
export const displayAskClinicName = displayPublicClinicName;

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