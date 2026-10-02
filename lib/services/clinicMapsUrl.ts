export type ClinicMapLocation = {
  name: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_maps_url?: string | null;
};

/** Prefer exact coordinates; otherwise use the owner's map URL or full address. */
export function clinicMapsUrl(clinic: ClinicMapLocation): string | null {
  if (
    typeof clinic.latitude === 'number' && Number.isFinite(clinic.latitude) &&
    typeof clinic.longitude === 'number' && Number.isFinite(clinic.longitude)
  ) {
    const coordinates = `${clinic.latitude},${clinic.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
  }

  const savedUrl = clinic.google_maps_url?.trim();
  if (savedUrl) return savedUrl;

  const locality = [clinic.address, clinic.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('، ');
  if (!locality) return null;

  const query = [clinic.name, locality].filter(Boolean).join('، ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}