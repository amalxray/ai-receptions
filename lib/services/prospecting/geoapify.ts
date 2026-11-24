import { geocodeCity } from './openstreetmap';
import type { ProspectClinic } from './types';

const GEOAPIFY_URL = 'https://api.geoapify.com/v2/places';
const REQUEST_TIMEOUT_MS = 30_000;

type GeoapifyProperties = {
  place_id?: string;
  name?: string;
  formatted?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  contact?: {
    phone?: string;
    website?: string;
    email?: string;
  };
  categories?: string[];
  [key: string]: unknown;
};

type GeoapifyFeature = {
  properties?: GeoapifyProperties;
  geometry?: { coordinates?: unknown };
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function primitiveTags(properties: GeoapifyProperties): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

async function requestPlaces(filter: string, apiKey: string): Promise<GeoapifyFeature[]> {
  const url = new URL(GEOAPIFY_URL);
  url.search = new URLSearchParams({
    categories: 'healthcare.dentist,healthcare.clinic_or_praxis',
    filter,
    limit: '50',
    apiKey,
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Geoapify request timed out.');
    throw new Error(`Geoapify request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Geoapify request failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { features?: unknown }).features)) {
    throw new Error('Geoapify returned an invalid features payload.');
  }
  return (payload as { features: GeoapifyFeature[] }).features;
}

export async function searchGeoapifyClinics(
  city: string,
  country: string,
): Promise<ProspectClinic[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) throw new Error('GEOAPIFY_API_KEY is not configured.');

  let features: GeoapifyFeature[];
  try {
    features = await requestPlaces(`place:${city.trim()},${country.trim()}`, apiKey);
  } catch (placeError) {
    const location = await geocodeCity(city, country);
    if (!location) {
      throw new Error(`Geoapify place filter failed: ${placeError instanceof Error ? placeError.message : 'Unknown error'}`);
    }
    try {
      features = await requestPlaces(`circle:${location.lon},${location.lat},15000`, apiKey);
    } catch (circleError) {
      throw new Error(`Geoapify place and circle filters failed: ${circleError instanceof Error ? circleError.message : 'Unknown error'}`);
    }
  }

  const clinics: ProspectClinic[] = [];
  for (const feature of features) {
    const properties = feature.properties ?? {};
    const name = stringValue(properties.name) ?? stringValue(properties.formatted)?.split(',')[0]?.trim();
    const placeId = stringValue(properties.place_id);
    if (!name || !placeId) continue;
    const coordinates = Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
    const longitude = typeof coordinates[0] === 'number' ? coordinates[0] : undefined;
    const latitude = typeof coordinates[1] === 'number' ? coordinates[1] : undefined;
    const address = stringValue(properties.formatted)
      ?? ([properties.street, properties.housenumber, properties.city].map(stringValue).filter(Boolean).join(', ') || undefined);
    const phone = stringValue(properties.contact?.phone);
    const website = stringValue(properties.contact?.website);
    const email = stringValue(properties.contact?.email);

    clinics.push({
      clinic_name: name,
      ...(phone ? { phone } : {}),
      ...(website ? { website } : {}),
      ...(email ? { email } : {}),
      ...(address ? { address } : {}),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      source: 'geoapify',
      source_id: `geoapify:${placeId}`,
      metadata: {
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        tags: { ...primitiveTags(properties), 'geoapify:source': 'geoapify' },
      },
    });
  }
  return clinics;
}
