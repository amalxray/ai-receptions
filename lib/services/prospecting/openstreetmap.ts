import { supabaseAdmin } from '@/lib/supabase/admin';

const OVERPASS_URLS = [
  'https://overpass-turbo.eu/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.osm.rambler.ru/cgi/interpreter',
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 2_000;
const GEOCODE_OVERPASS_DELAY_MS = 1_000;

export type OSMClinic = {
  clinic_name: string;
  doctor_name?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city: string;
  country: string;
  source: 'openstreetmap';
  source_id: string;
  metadata: {
    latitude?: number;
    longitude?: number;
    tags: Record<string, string>;
  };
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, unknown>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type NominatimSearchResult = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string | number;
  lon?: string | number;
  display_name?: string;
  type?: string;
  extratags?: Record<string, unknown> | null;
  address?: Record<string, unknown> | null;
};

export type GeocodedCity = {
  lat: number;
  lon: number;
  display_name: string;
};

let lastRequestStartedAt: number | null = null;
let requestQueue: Promise<void> = Promise.resolve();

function buildQuery(lat: number, lon: number): string {
  return `
[out:json][timeout:25];
(
  node["amenity"="dentist"](around:15000,${lat},${lon});
  way["amenity"="dentist"](around:15000,${lat},${lon});
  node["healthcare"="dentist"](around:15000,${lat},${lon});
  way["healthcare"="dentist"](around:15000,${lat},${lon});
  node["healthcare"="imaging"](around:15000,${lat},${lon});
  way["healthcare"="imaging"](around:15000,${lat},${lon});
);
out center tags;
`.trim();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nominatimCountryCode(country: string): string | undefined {
  const normalized = country.trim().toLowerCase();
  if (normalized === 'uk') return 'gb';
  return /^[a-z]{2}$/.test(normalized) ? normalized : undefined;
}

function isGeocodedCity(value: unknown): value is GeocodedCity {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as Record<string, unknown>;
  const lat = typeof place.lat === 'string' ? Number(place.lat) : place.lat;
  const lon = typeof place.lon === 'string' ? Number(place.lon) : place.lon;
  return typeof lat === 'number' && Number.isFinite(lat)
    && typeof lon === 'number' && Number.isFinite(lon)
    && typeof place.display_name === 'string';
}

/** Resolve a city name to its OpenStreetMap coordinates. */
export async function geocodeCity(
  city: string,
  country: string,
): Promise<GeocodedCity | null> {
  const url = new URL(NOMINATIM_URL);
  const params = new URLSearchParams({
    q: `${city.trim()},${country.trim()}`,
    format: 'json',
    limit: '1',
  });
  const countryCode = nominatimCountryCode(country);
  if (countryCode) params.set('countrycodes', countryCode);
  url.search = params.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Dentairec-Prospect-Bot/1.0',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Nominatim request timed out after ${REQUEST_TIMEOUT_MS} ms`);
    }
    const detail = error instanceof Error ? error.message : 'Unknown network error';
    throw new Error(`Nominatim geocoding request failed: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Nominatim request failed with HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Nominatim returned invalid JSON.');
  }
  if (!Array.isArray(payload)) {
    throw new Error('Nominatim response is not a results array.');
  }

  const place = payload[0];
  if (place === undefined) return null;
  if (!isGeocodedCity(place)) {
    throw new Error('Nominatim response is missing valid coordinates or display_name.');
  }

  return {
    lat: typeof place.lat === 'string' ? Number(place.lat) : place.lat,
    lon: typeof place.lon === 'string' ? Number(place.lon) : place.lon,
    display_name: place.display_name,
  };
}

async function fetchRateLimited(endpoint: string, query: string): Promise<Response> {
  let releaseQueue!: () => void;
  const previousRequest = requestQueue;
  requestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousRequest;
  try {
    if (lastRequestStartedAt !== null) {
      const elapsed = Date.now() - lastRequestStartedAt;
      const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
      if (waitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }

    lastRequestStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Dentairec-Prospect-Bot/1.0 (https://www.dentairec.com)',
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Overpass request timed out after ${REQUEST_TIMEOUT_MS} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    releaseQueue();
  }
}

function getStringTag(tags: Record<string, unknown>, key: string): string | undefined {
  const value = tags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toOSMClinic(
  element: OverpassElement,
  city: string,
  country: string,
): OSMClinic | null {
  const tags = Object.fromEntries(
    Object.entries(element.tags ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const clinicName = getStringTag(tags, 'name');
  if (!clinicName) return null;

  const street = getStringTag(tags, 'addr:street');
  const houseNumber = getStringTag(tags, 'addr:housenumber');
  const address = [street, houseNumber].filter(Boolean).join(' ');
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;

  return {
    clinic_name: clinicName,
    ...(getStringTag(tags, 'healthcare:speciality')
      ? { doctor_name: getStringTag(tags, 'healthcare:speciality') }
      : {}),
    ...(getStringTag(tags, 'phone') || getStringTag(tags, 'contact:phone')
      ? { phone: getStringTag(tags, 'phone') ?? getStringTag(tags, 'contact:phone') }
      : {}),
    ...(getStringTag(tags, 'email') || getStringTag(tags, 'contact:email')
      ? { email: getStringTag(tags, 'email') ?? getStringTag(tags, 'contact:email') }
      : {}),
    ...(getStringTag(tags, 'website') ? { website: getStringTag(tags, 'website') } : {}),
    ...(address ? { address } : {}),
    city: city.trim(),
    country: country.trim(),
    source: 'openstreetmap',
    source_id: `osm:${element.type}:${element.id}`,
    metadata: {
      ...(typeof latitude === 'number' ? { latitude } : {}),
      ...(typeof longitude === 'number' ? { longitude } : {}),
      tags,
    },
  };
}

function isOverpassResponse(value: unknown): value is OverpassResponse {
  return typeof value === 'object' && value !== null && 'elements' in value
    && Array.isArray((value as { elements?: unknown }).elements);
}

function isNominatimSearchResult(value: unknown): value is NominatimSearchResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as NominatimSearchResult;
  const lat = typeof result.lat === 'string' ? Number(result.lat) : result.lat;
  const lon = typeof result.lon === 'string' ? Number(result.lon) : result.lon;
  return typeof result.display_name === 'string'
    && typeof lat === 'number' && Number.isFinite(lat)
    && typeof lon === 'number' && Number.isFinite(lon);
}

async function searchNominatimClinics(city: string, country: string): Promise<OSMClinic[]> {
  const url = new URL(NOMINATIM_URL);
  const params = new URLSearchParams({
    q: `dentist in ${city.trim()}, ${country.trim()}`,
    format: 'json',
    extratags: '1',
    limit: '50',
  });
  const countryCode = nominatimCountryCode(country);
  if (countryCode) params.set('countrycodes', countryCode);
  url.search = params.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Dentairec-Prospect-Bot/1.0',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Nominatim fallback failed with HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('Nominatim fallback returned invalid JSON.');

  return payload.filter(isNominatimSearchResult).map((result, index) => {
    const tags = Object.fromEntries(
      Object.entries(result.extratags ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    const address = result.address ?? {};
    const addressText = [
      getStringTag(address, 'road'),
      getStringTag(address, 'house_number'),
      getStringTag(address, 'neighbourhood'),
    ].filter(Boolean).join(' ');
    const firstName = result.display_name.split(',')[0]?.trim() || `Dentist ${index + 1}`;
    const lat = typeof result.lat === 'string' ? Number(result.lat) : result.lat;
    const lon = typeof result.lon === 'string' ? Number(result.lon) : result.lon;
    const sourceId = result.osm_type && result.osm_id
      ? `nominatim:${result.osm_type}:${result.osm_id}`
      : `nominatim:place:${result.place_id ?? `${city}:${index}`}`;

    return {
      clinic_name: firstName,
      ...(getStringTag(tags, 'phone') ? { phone: getStringTag(tags, 'phone') } : {}),
      ...(getStringTag(tags, 'email') ? { email: getStringTag(tags, 'email') } : {}),
      ...(getStringTag(tags, 'website') ? { website: getStringTag(tags, 'website') } : {}),
      ...(addressText ? { address: addressText } : {}),
      city: city.trim(),
      country: country.trim(),
      source: 'openstreetmap' as const,
      source_id: sourceId,
      metadata: {
        latitude: lat,
        longitude: lon,
        tags: { ...tags, 'nominatim:type': result.type ?? 'dentist' },
      },
    };
  });
}

/** Search OpenStreetMap for dental clinics and imaging providers in a city. */
export async function searchClinics(city: string, country: string): Promise<OSMClinic[]> {
  if (!city.trim()) throw new Error('City must not be empty');
  if (!country.trim()) throw new Error('Country must not be empty');

  const location = await geocodeCity(city, country);
  if (!location) throw new Error(`City not found: ${city}, ${country}`);
  await delay(GEOCODE_OVERPASS_DELAY_MS);

  const query = buildQuery(location.lat, location.lon);
  let payload: unknown;
  const endpointErrors: string[] = [];

  for (const endpoint of OVERPASS_URLS) {
    try {
      const response = await fetchRateLimited(endpoint, query);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Overpass API rate limit exceeded (HTTP 429).');
        }
        throw new Error(`Overpass API request failed with HTTP ${response.status}.`);
      }

      try {
        payload = await response.json();
      } catch {
        throw new Error('Overpass API returned invalid JSON.');
      }
      if (!isOverpassResponse(payload)) {
        throw new Error('Overpass API response is missing an elements array.');
      }
      break;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      endpointErrors.push(`${endpoint}: ${detail}`);
    }
  }

  if (!isOverpassResponse(payload)) {
    try {
      const fallbackClinics = await searchNominatimClinics(city, country);
      if (fallbackClinics.length > 0) return fallbackClinics;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      endpointErrors.push(`Nominatim fallback: ${detail}`);
    }
    throw new Error(`All Overpass endpoints and Nominatim fallback failed: ${endpointErrors.join(' ')}`);
  }

  return payload.elements
    .filter((element) => (element.type === 'node' || element.type === 'way')
      && Number.isInteger(element.id))
    .map((element) => toOSMClinic(element, city, country))
    .filter((clinic): clinic is OSMClinic => clinic !== null);
}

/** Insert newly discovered clinics; existing source IDs are left unchanged. */
export async function saveClinicsToProspects(
  clinics: OSMClinic[],
): Promise<{ inserted: number; skipped: number }> {
  if (clinics.length === 0) return { inserted: 0, skipped: 0 };

  const uniqueClinics = Array.from(
    new Map(clinics.map((clinic) => [`${clinic.source}:${clinic.source_id}`, clinic])).values(),
  );
  const { data, error } = await supabaseAdmin
    .from('prospects')
    .upsert(uniqueClinics, {
      onConflict: 'source,source_id',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    throw new Error(`Failed to save OpenStreetMap prospects: ${error.message}`);
  }

  const inserted = data?.length ?? 0;
  return {
    inserted,
    skipped: clinics.length - inserted,
  };
}
