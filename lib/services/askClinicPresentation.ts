/**
 * Replace technical clinic identifiers with an Arabic label in public surfaces.
 *
 * A name is treated as a REAL name (shown verbatim) unless it is a pure slug:
 * lowercase letters, digits and hyphens only — no spaces, no uppercase, no
 * Arabic. This keeps genuine hyphenated brand names like "Amal X-Ray Center"
 * visible while still masking auto-generated slugs like "amal-x-ray-center".
 */
export function displayPublicClinicName(name: string, activityType?: string | null): string {
  const trimmed = name.trim();
  const isSlug = /^[a-z0-9-]+$/.test(trimmed);
  if (trimmed && !isSlug) return trimmed;
  return activityType === 'imaging_center' ? 'مركز طبي' : 'عيادة شريكة';
}

/** Backwards-compatible name used by the /ask cards. */
export const displayAskClinicName = displayPublicClinicName;

/**
 * Extract a clinic's public logo URL from its `settings` JSONB
 * (canonical: settings.public_profile.logo — same field the owner upload
 * writes to and the public /{slug} page reads). Returns null when unset.
 * Pure helper shared by /ask surfaces; no DB access here.
 */
export function readPublicProfileLogo(settings: unknown): string | null {
  const pp = (settings as { public_profile?: { logo?: unknown } } | null)?.public_profile;
  return typeof pp?.logo === 'string' && /^https?:\/\//.test(pp.logo) ? pp.logo : null;
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