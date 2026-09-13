'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type PatientLocation = { lat: number; lng: number; city?: string | null; address?: string | null };

type City = { id: string; name_ar: string; latitude: number | null; longitude: number | null };

// Default marker icon (Leaflet's default icons break under bundlers)
const ICON = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
};

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({
  value,
  onChange,
  compact = false,
}: {
  value: PatientLocation | null;
  onChange: (loc: PatientLocation | null) => void;
  compact?: boolean;
}) {
  const [cities, setCities] = useState<City[]>([]);
  const [address, setAddress] = useState<string | null>(value?.address ?? null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [manualCity, setManualCity] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/public/cities');
        const json = await res.json();
        setCities((json.data ?? []) as City[]);
      } catch {
        /* noop */
      }
    })();
  }, []);

  // Reverse geocode (Nominatim) — best effort.
  const reverse = useCallback(async (lat: number, lng: number) => {
    setLoadingGeo(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`);
      const j = (await res.json()) as { address?: Record<string, string>; display_name?: string };
      const a = j.address ?? {};
      const short = [a.road ?? a.neighbourhood ?? a.suburb, a.city ?? a.town ?? a.village ?? a.state].filter(Boolean).join('، '); 
      setAddress(short || j.display_name?.slice(0, 80) || null);
    } catch {
      setAddress(null);
    } finally {
      setLoadingGeo(false);
    }
  }, []);

  const pick = useCallback(
    (lat: number, lng: number) => {
      onChange({ lat, lng, city: null, address: address ?? null });
      void reverse(lat, lng);
    },
    [address, onChange, reverse]
  );

  const gps = () => {
    if (!navigator.geolocation) {
      alert('متصفحك لا يدعم تحديد الموقع');
      return;
    }
    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onChange({ lat, lng, city: null, address: null });
        void reverse(lat, lng);
      },
      () => setLoadingGeo(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const chooseCity = (name: string) => {
    const c = cities.find((x) => x.name_ar === name);
    if (c?.latitude && c?.longitude) {
      onChange({ lat: Number(c.latitude), lng: Number(c.longitude), city: c.name_ar, address: null });
      setAddress(c.name_ar);
    }
  };

  const searchAddress = async () => {
    const q = manualCity.trim();
    if (!q) return;
    setLoadingGeo(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=ar`);
      const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (rows[0]) {
        const lat = Number(Number(rows[0].lat).toFixed(6));
        const lng = Number(Number(rows[0].lon).toFixed(6));
        onChange({ lat, lng, city: null, address: rows[0].display_name.slice(0, 90) });
        setAddress(rows[0].display_name.slice(0, 90));
      }
    } catch {
      /* noop */
    } finally {
      setLoadingGeo(false);
    }
  };

  const confirm = () => {
    if (!value) return;
    onChange({ ...value, address: address ?? null });
  };

  const hasValue = Boolean(value?.lat && value?.lng);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={gps} className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">📍 حدد موقعي (GPS)</button>
        <div className="flex flex-1 items-center gap-2">
          <input
            value={manualCity}
            onChange={(e) => setManualCity(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void searchAddress(); }}
            placeholder="أو ابحث بالعنوان..."
            className="w-full rounded-full border border-white/10 bg-slate-900/70 px-4 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <button type="button" onClick={() => void searchAddress()} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/20">🔍</button>
        </div>
        <select
          value=""
          onChange={(e) => chooseCity(e.target.value)}
          className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">اختر مدينتك</option>
          {cities.map((c) => <option key={c.id} value={c.name_ar}>{c.name_ar}</option>)}
        </select>
      </div>

      <div className={`mt-3 ${compact ? 'h-44' : 'h-64'} overflow-hidden rounded-xl`}>
        <MapContainer
          center={[value?.lat ?? 32.2211, value?.lng ?? 35.2544]}
          zoom={hasValue ? 13 : 11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPick={pick} />
          {hasValue && <Marker position={[value!.lat, value!.lng]} icon={ICON as never} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as { getLatLng: () => { lat: number; lng: number } }).getLatLng(); pick(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); } }} />}
        </MapContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {loadingGeo ? '⏳ جارٍ تحديد الموقع...' : hasValue ? `✅ ${address ?? 'الموقع محدد'} (${value!.lat}, ${value!.lng})` : 'انقر على الخريطة أو استخدم GPS'}
        </p>
        <button
          type="button"
          onClick={confirm}
          disabled={!hasValue}
          className="rounded-full bg-cyan-500 px-5 py-1.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
        >
          تأكيد الموقع ✓
        </button>
      </div>
    </div>
  );
}
