'use client';

export type SuggestedClinic = {
  id: string;
  name: string;
  slug: string;
  type: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  google_maps_url: string | null;
  distance_km: number | null;
  booking_url: string;
};

const TYPE_LABEL: Record<string, string> = {
  clinic: '🏥 عيادة',
  imaging_center: '📷 مركز أشعة',
  dental_lab: '🦷 مختبر',
};

/** Clinic suggestion card for /ask — details + distance + maps + booking. */
export default function ClinicCard({ clinic }: { clinic: SuggestedClinic }) {
  const mapsUrl =
    clinic.google_maps_url ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${clinic.name} ${clinic.city ?? ''}`)}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-100">{clinic.name}</p>
          <p className="text-xs text-slate-400">{TYPE_LABEL[clinic.type] ?? clinic.type}{clinic.city ? ` · ${clinic.city}` : ''}</p>
        </div>
        {clinic.distance_km != null && (
          <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-200">📍 {clinic.distance_km} كم</span>
        )}
      </div>
      {clinic.address && <p className="mt-2 text-xs text-slate-400">{clinic.address}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={clinic.booking_url} className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">🦷 احجز الآن</a>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-slate-200 hover:bg-white/20">🗺️ خرائط</a>
        {clinic.phone && <a href={`tel:${clinic.phone}`} dir="ltr" className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-slate-200 hover:bg-white/20">📞 {clinic.phone}</a>}
      </div>
    </div>
  );
}
