import type { DoctorPublicProfile } from '@/lib/services/doctorPublicProfile';

/**
 * PP-8C — schema.org JSON-LD baseline (spec §10.1): Physician inside a
 * Dentist (MedicalBusiness) node. Built ONLY from the allow-listed public
 * projection — no private data can reach structured data. Contact details
 * and prices follow the same opt-in flags as the visible page.
 *
 * Standalone module: Next.js page files may not export arbitrary helpers.
 */

const JSON_LD_DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function buildOpeningHoursSchema(hours: Array<{ weekday: number; start_time: string; end_time: string }> = []) {
  return hours
    .filter((hour) => typeof hour?.weekday === 'number' && hour.start_time && hour.end_time)
    .map((hour) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: JSON_LD_DAY_NAMES[hour.weekday] ?? 'Monday',
      opens: hour.start_time,
      closes: hour.end_time,
    }));
}

const PUBLIC_SOCIAL_KEYS = new Set(['website', 'facebook', 'instagram', 'linkedin', 'x', 'whatsapp', 'youtube']);

export function sanitizePublicSocialLinks(
  links: Record<string, string | undefined> | null | undefined
): string[] {
  const seen = new Set<string>();

  return Object.entries(links ?? {})
    .filter(([key, value]) => PUBLIC_SOCIAL_KEYS.has(key) && typeof value === 'string' && value.trim().length > 0)
    .map(([, value]) => value!.trim())
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

export function buildClinicSchema(input: {
  name: string;
  pageUrl?: string | null;
  description?: string | null;
  logo?: string | null;
  phone?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  socialLinks?: Record<string, string | undefined> | null;
  services?: Array<{ name: string; description?: string | null; duration_minutes?: number | null; price?: number | null; price_min?: number | null; price_max?: number | null }> | null;
  openingHours?: Array<{ weekday: number; start_time: string; end_time: string }> | null;
}): Record<string, unknown> {
  const links = sanitizePublicSocialLinks(input.socialLinks);
  const address = input.city || input.area || input.address
    ? {
        '@type': 'PostalAddress',
        addressCountry: 'PS',
        ...(input.city ? { addressLocality: input.city } : {}),
        ...(input.area ? { addressRegion: input.area } : {}),
        ...(input.address ? { streetAddress: input.address } : {}),
      }
    : undefined;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    name: input.name,
    ...(input.pageUrl ? { url: input.pageUrl } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.logo ? { image: input.logo } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(address ? { address } : {}),
    ...(links.length > 0 ? { sameAs: links } : {}),
    ...(input.openingHours && input.openingHours.length > 0
      ? { openingHoursSpecification: buildOpeningHoursSchema(input.openingHours) }
      : {}),
    ...(input.services && input.services.length > 0
      ? { makesOffer: input.services.map((service) => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: service.name,
            ...(service.description ? { description: service.description } : {}),
            ...(service.duration_minutes != null ? { duration: `PT${service.duration_minutes}M` } : {}),
            ...(service.price != null || service.price_min != null || service.price_max != null
              ? {
                  offers: {
                    '@type': 'Offer',
                    priceCurrency: 'ILS',
                    ...(service.price != null ? { price: String(service.price) } : {}),
                    ...(service.price_min != null || service.price_max != null
                      ? { priceSpecification: {
                          '@type': 'UnitPriceSpecification',
                          ...(service.price_min != null ? { minPrice: String(service.price_min) } : {}),
                          ...(service.price_max != null ? { maxPrice: String(service.price_max) } : {}),
                          priceCurrency: 'ILS',
                        } }
                      : {}),
                  },
                }
              : {}),
          },
        })) }
      : {}),
    areaServed: { '@type': 'AdministrativeArea', name: 'فلسطين' },
    knowsLanguage: ['ar', 'en'],
  };

  return schema;
}

export function buildDoctorJsonLd(profile: DoctorPublicProfile): Record<string, unknown> {
  const clinicRef = `${profile.clinic.pageUrl}#clinic`;
  const updatedAt = profile.updated_at ?? null;

  const clinicNode: Record<string, unknown> = {
    '@type': 'Dentist',
    '@id': clinicRef,
    name: profile.clinic.name,
    url: profile.clinic.pageUrl,
  };
  if (profile.clinic.city || profile.clinic.area || profile.clinic.address) {
    clinicNode.address = {
      '@type': 'PostalAddress',
      ...(profile.clinic.city ? { addressLocality: profile.clinic.city } : {}),
      ...(profile.clinic.area ? { addressRegion: profile.clinic.area } : {}),
      ...(profile.clinic.address ? { streetAddress: profile.clinic.address } : {}),
    };
  }
  if (profile.clinic.phone) clinicNode.telephone = profile.clinic.phone;
  if (profile.workingHours.length > 0) {
    clinicNode.openingHoursSpecification = profile.workingHours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: JSON_LD_DAY_NAMES[h.weekday] ?? 'Monday',
      opens: h.start_time,
      closes: h.end_time,
    }));
  }
  if (profile.services.length > 0) {
    clinicNode.makesOffer = profile.services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name },
    }));
  }

  const physicianNode: Record<string, unknown> = {
    '@type': 'Physician',
    name: profile.name,
    url: profile.pageUrl,
    worksFor: { '@id': clinicRef },
    ...(profile.title?.trim() ? { medicalSpecialty: profile.title.trim() } : {}),
    ...(profile.bio ? { description: profile.bio } : {}),
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    publisher: {
      '@type': 'MedicalBusiness',
      '@id': clinicRef,
      name: profile.clinic.name,
      url: profile.clinic.pageUrl,
    },
  };
  if (profile.photo_url) physicianNode.image = profile.photo_url;
  if (profile.clinic.pageUrl) clinicNode.sameAs = [profile.clinic.pageUrl];
  if (profile.clinic.city || profile.clinic.area) {
    clinicNode.areaServed = {
      '@type': 'AdministrativeArea',
      ...(profile.clinic.city ? { name: profile.clinic.city } : {}),
      ...(profile.clinic.area ? { addressRegion: profile.clinic.area } : {}),
    };
  }

  return { '@context': 'https://schema.org', '@graph': [physicianNode, clinicNode] };
}
