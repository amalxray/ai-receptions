/** Stable ordering for the small public partner directory on /ask. */
export const FEATURED_ASK_CLINIC_SLUG = 'amal-x-ray-center';

export function prioritizeAskClinics<T extends { slug: string }>(clinics: T[], limit = 6): T[] {
  return [...clinics]
    .sort((a, b) => {
      const featuredFirst = Number(b.slug === FEATURED_ASK_CLINIC_SLUG) - Number(a.slug === FEATURED_ASK_CLINIC_SLUG);
      return featuredFirst || a.slug.localeCompare(b.slug);
    })
    .slice(0, limit);
}