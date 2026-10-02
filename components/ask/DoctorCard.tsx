'use client';

import { clinicMapsUrl } from '@/lib/services/clinicMapsUrl';

export type PartnerClinic = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  address_detail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_maps_url?: string | null;
  activity_type: string | null;
  distance_km?: number | null;
  /**
   * Canonical tenant subdomain URL (`https://{slug}.dentairec.com`), built
   * server-side by the /ask data loader. Absolute on purpose: the legacy apex
   * path `/{slug}` 301-redirects to the subdomain, so links must point straight
   * at the canonical host.
   */
  booking_url: string;
};

const TYPE_EMOJI: Record<string, string> = { clinic: '🏥', imaging_center: '📷', dental_lab: '🦷' };
const TYPE_LABEL: Record<string, string> = { clinic: 'عيادة أسنان', imaging_center: 'مركز أشعة', dental_lab: 'مختبر' };

export function DoctorCard({ clinic }: { clinic: PartnerClinic }) {
  const city = clinic.city?.trim();
  const address = clinic.address_detail?.trim();
  const mapsUrl = clinicMapsUrl({
    name: clinic.name,
    city,
    address,
    latitude: clinic.latitude,
    longitude: clinic.longitude,
    google_maps_url: clinic.google_maps_url,
  });

  return (
    <div className="doctor-card">
      {clinic.distance_km != null && <span className="doctor-distance">📍 {clinic.distance_km} كم</span>}
      <div className="doctor-image">{TYPE_EMOJI[clinic.activity_type ?? 'clinic'] ?? '🏥'}</div>
      <div className="doctor-info">
        <span>{clinic.name}</span>
        <p>{TYPE_LABEL[clinic.activity_type ?? 'clinic'] ?? ''}{city ? ` — ${city}` : ''}</p>
        {address && <p>{address}</p>}
        {!city && !address && <p className="text-slate-500">الموقع قيد التحديد</p>}
      </div>
      {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="doctor-button">🗺️ افتح الموقع</a>}
      <a href={clinic.booking_url} className="doctor-button">احجز الآن</a>
    </div>
  );
}
