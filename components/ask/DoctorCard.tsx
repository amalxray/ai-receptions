'use client';

import React from 'react';
import { clinicMapsUrl } from '@/lib/services/clinicMapsUrl';
import { displayAskClinicName } from '@/lib/services/askClinicPresentation';

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
  /** Owner-managed public logo (settings.public_profile.logo); null → emoji fallback. */
  logo?: string | null;
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

import { TiltCard } from '@/components/landing/motion';

export function DoctorCard({ clinic }: { clinic: PartnerClinic }) {
  const displayName = displayAskClinicName(clinic.name, clinic.activity_type);
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
    <TiltCard className="relative group overflow-hidden rounded-3xl backdrop-blur-xl bg-gradient-to-br from-white/80 to-white/60 border border-white/60 shadow-2xl hover:shadow-[0_20px_60px_rgba(99,102,241,0.4)] transition-all duration-500">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-violet-400/30 to-indigo-400/30 rounded-full blur-3xl"></div>
      
      {clinic.distance_km != null && (
        <span className="absolute top-4 left-4 z-10 backdrop-blur-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
          📍 {clinic.distance_km} كم
        </span>
      )}
      
      <div className="relative h-48 flex items-center justify-center bg-gradient-to-br from-indigo-50 to-cyan-50">
        {clinic.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clinic.logo} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="text-6xl transform group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
            {TYPE_EMOJI[clinic.activity_type ?? 'clinic'] ?? '🏥'}
          </div>
        )}
        <div className="absolute top-4 right-4">
          <span className="backdrop-blur-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
            {TYPE_LABEL[clinic.activity_type ?? 'clinic'] ?? 'عيادة'}
          </span>
        </div>
      </div>
      
      <div className="relative p-6 space-y-3">
        <div>
          <h3 className="font-black text-lg text-slate-900 group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-cyan-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
            {displayName}
          </h3>
          <p className="text-sm text-slate-600 mt-1">{city ? `📍 ${city}` : 'الموقع قيد التحديد'}</p>
          {address && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{address}</p>}
        </div>
        
        <div className="flex flex-wrap gap-2 pt-2">
          {mapsUrl && (
            <a 
              href={mapsUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex-1 min-w-[calc(50%-4px)] text-center backdrop-blur-md bg-white/70 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white hover:shadow-md hover:scale-105 transition-all duration-300"
            >
              🗺️ الموقع
            </a>
          )}
          <a 
            href={clinic.booking_url} 
            className="flex-1 min-w-[calc(50%-4px)] text-center bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:scale-105 transition-all duration-300"
          >
            احجز الآن →
          </a>
        </div>
      </div>
    </TiltCard>
  );
}
