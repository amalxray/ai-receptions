import { searchClinics } from './openstreetmap';
import { searchFoursquareClinics } from './foursquare';
import { searchGeoapifyClinics } from './geoapify';
import type { ProspectClinic } from './types';

export type SourceReport = { name: string; count: number; error?: string };

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

  return { clinics: Array.from(byKey.values()), sources };
}
