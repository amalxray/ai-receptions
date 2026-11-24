import type { ProspectClinic } from './types';

const FOURSQUARE_URL = 'https://api.foursquare.com/v3/places/search';
const REQUEST_TIMEOUT_MS = 30_000;

type FoursquareLocation = {
  formatted?: string;
  address?: string;
  locality?: string;
  region?: string;
};

type FoursquarePlace = {
  fsq_id?: string;
  name?: string;
  location?: FoursquareLocation;
  tel?: string;
  website?: string;
  email?: string;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function searchFoursquareClinics(
  city: string,
  country: string,
): Promise<ProspectClinic[]> {
  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
  if (!apiKey) throw new Error('FOURSQUARE_API_KEY is not configured.');

  const url = new URL(FOURSQUARE_URL);
  url.search = new URLSearchParams({
    near: `${city.trim()}, ${country.trim()}`,
    categories: '15014',
    limit: '50',
    fields: 'fsq_id,name,location,tel,website,email',
  }).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Foursquare request timed out.');
    throw new Error(`Foursquare request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Foursquare request failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { results?: unknown }).results)) {
    throw new Error('Foursquare returned an invalid results payload.');
  }

  return ((payload as { results: FoursquarePlace[] }).results).flatMap((place) => {
    const id = stringValue(place.fsq_id);
    const name = stringValue(place.name);
    if (!id || !name) return [];
    const location = place.location ?? {};
    const address = stringValue(location.formatted)
      ?? ([location.address, location.locality, location.region].map(stringValue).filter(Boolean).join(', ') || undefined);
    const phone = stringValue(place.tel);
    const website = stringValue(place.website);
    const email = stringValue(place.email);

    return [{
      clinic_name: name,
      ...(phone ? { phone } : {}),
      ...(website ? { website } : {}),
      ...(email ? { email } : {}),
      ...(address ? { address } : {}),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      source: 'foursquare' as const,
      source_id: `foursquare:${id}`,
      metadata: {
        tags: {
          'foursquare:fsq_id': id,
          'foursquare:source': 'foursquare',
        },
      },
    }];
  });
}
