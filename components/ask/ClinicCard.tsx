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
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-800">{clinic.name}</p>
          <p className="text-xs text-slate-600">{TYPE_LABEL[clinic.type] ?? clinic.type}{clinic.city ? ` · ${clinic.city}` : ''}</p>
        </div>
        {clinic.distance_km != null && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">📍 {clinic.distance_km} كم</span>
        )}
      </div>
      {clinic.address && <p className="mt-2 text-xs text-slate-600">{clinic.address}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={clinic.booking_url} className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700">🦷 احجز موعدك</a>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200">🗺️ افتح الموقع</a>
        {clinic.phone && <a href={`tel:${clinic.phone}`} dir="ltr" className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200">📞 {clinic.phone}</a>}
      </div>
    </div>
  );
}
