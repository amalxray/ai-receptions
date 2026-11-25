import { searchClinics } from './openstreetmap';
import { searchFoursquareClinics } from './foursquare';
import { searchGeoapifyClinics } from './geoapify';
import { getCountries, getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js';
import type { ProspectClinic } from './types';

export type SourceReport = { name: string; count: number; error?: string; filtered?: number };

const KNOWN_CALLING_CODES = Array.from(
  new Set(getCountries().map((country) => getCountryCallingCode(country))),
).sort((a, b) => b.length - a.length);

const EXCLUDED_NAME_PATTERNS = [
  /منزل/i,
  /مستشفى/i,
  /إسعاف/i,
  /مختبر/i,
  /صيدلية/i,
  /بنك دم/i,
  /هلال أحمر/i,
  /hospital/i,
  /emergency/i,
  /\blab\b/i,
  /pharmacy/i,
  /blood/i,
  /ambulance/i,
  /red crescent/i,
  /medical lab/i,
  /testing/i,
];

const GENERIC_NAMES = new Set([
  'clinic',
  'dentist',
  'medical center',
  'health clinic',
  'medical clinic',
  'doctor',
  'عيادة',
  'مركز',
]);

const DENTAL_NAME_PATTERN = /أسنان|بانوراما|أشعة أسنان|تصوير أسنان|\bdent\b|tooth|panorama|dental x[- ]ray|dental imaging/i;

export function isDentalRelevant(clinic: ProspectClinic): boolean {
  const name = clinic.clinic_name.trim();
  if (!name || /[\u0590-\u05FF]/.test(name)) return false;
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(`${name} ${clinic.address ?? ''}`))) return false;
  if (!clinic.phone && !clinic.email && !clinic.website) return false;
  if (GENERIC_NAMES.has(name.toLocaleLowerCase('ar')) && !clinic.phone && !clinic.email && !clinic.website) return false;

  const tags = clinic.metadata.tags ?? {};
  const categories = Object.values(tags).join(' ').toLocaleLowerCase('en');
  const sourceCategory = clinic.source === 'openstreetmap'
    && ['dentist', 'healthcare:dentist'].some((value) => Object.values(tags).some((tag) => tag.toLowerCase() === value));
  const foursquareDentist = clinic.source === 'foursquare'
    && (/(^|,)(15014|15015)(,|$)/.test(tags['foursquare:categories'] ?? '')
      || /dentist|dental hygienist/i.test(tags['foursquare:category_names'] ?? ''));
  const geoapifyDentist = clinic.source === 'geoapify' && categories.includes('healthcare.dentist');

  return sourceCategory || foursquareDentist || geoapifyDentist || DENTAL_NAME_PATTERN.test(name)
    || clinic.source === 'geoapify';
}

function normalizePhone(value: string | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  return digits || undefined;
}

function websiteDomain(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.match(/^https?:\/\//i) ? value : `https://${value}`).hostname
      .toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function normalizeName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[^a-z0-9\u0600-\u06ff]+/gi, '');
}

function dedupeKey(clinic: ProspectClinic) {
  return normalizePhone(clinic.phone)
    ?? websiteDomain(clinic.website)
    ?? `${normalizeName(clinic.clinic_name)}:${normalizeName(clinic.city)}`;
}

function richnessScore(clinic: ProspectClinic) {
  return (clinic.phone ? 2 : 0)
    + (clinic.email ? 1 : 0)
    + (clinic.website ? 1 : 0)
    + (clinic.address ? 1 : 0)
    + (clinic.doctor_name ? 1 : 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown source error';
}

export function countryMatchesPhone(country: string, phone: string | null): boolean {
  if (!phone?.trim()) return true;

  const countryCode = country.trim().toUpperCase();
  const trimmedPhone = phone.trim();
  const isInternational = trimmedPhone.startsWith('+') || trimmedPhone.startsWith('00');

  if (!isInternational) {
    const isNorthAmericanNationalFormat = /^\(?[2-9]\d{2}\)?[\s.-]*[2-9]\d{2}[\s.-]*\d{4}$/.test(trimmedPhone);
    if (isNorthAmericanNationalFormat && countryCode !== 'US' && countryCode !== 'CA') {
      return false;
    }
    return true;
  }

  const digits = trimmedPhone
    .replace(/^\+/, '')
    .replace(/^00/, '')
    .replace(/\D/g, '');
  const callingCode = KNOWN_CALLING_CODES.find((code) => digits.startsWith(code));
  if (!callingCode) return true;

  if (callingCode === '1') return countryCode === 'US' || countryCode === 'CA';
  if (callingCode === '44') return countryCode === 'UK' || countryCode === 'GB';

  const supportedCountry = countryCode === 'UK' ? 'GB' : countryCode;
  if (!isSupportedCountry(supportedCountry)) return false;
  return getCountryCallingCode(supportedCountry) === callingCode;
}

export async function fetchAllClinics(city: string, country: string): Promise<{
  clinics: ProspectClinic[];
  sources: SourceReport[];
}> {
  const jobs = [
    { name: 'Nominatim', run: () => searchClinics(city, country) as Promise<ProspectClinic[]> },
    { name: 'Foursquare', run: () => searchFoursquareClinics(city, country) },
    { name: 'Geoapify', run: () => searchGeoapifyClinics(city, country) },
  ];
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const byKey = new Map<string, ProspectClinic>();
  const sources: SourceReport[] = [];

  settled.forEach((result, index) => {
    const source = jobs[index];
    if (result.status === 'rejected') {
      sources.push({ name: source.name, count: 0, error: errorMessage(result.reason) });
      return;
    }
    sources.push({ name: source.name, count: result.value.length });
    for (const clinic of result.value) {
      const key = dedupeKey(clinic);
      const existing = byKey.get(key);
      if (!existing || richnessScore(clinic) > richnessScore(existing)) byKey.set(key, clinic);
    }
  });

  const deduplicatedClinics = Array.from(byKey.values());
  const phoneFilteredClinics = deduplicatedClinics.filter(
    (clinic) => countryMatchesPhone(clinic.country, clinic.phone ?? null),
  );
  sources.push({
    name: 'PhoneFilter',
    count: 0,
    filtered: deduplicatedClinics.length - phoneFilteredClinics.length,
  });

  const relevantClinics = phoneFilteredClinics.filter(isDentalRelevant);
  sources.push({
    name: 'QualityFilter',
    count: 0,
    filtered: phoneFilteredClinics.length - relevantClinics.length,
  });

  return { clinics: relevantClinics, sources };
}
