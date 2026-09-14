'use client';

import { useCallback, useState } from 'react';

/**
 * READ-ONLY public map (Leaflet via CDN — same loader pattern as
 * LocationMap, but no click/drag: visitors only see the clinic location).
 * Isolated so SSR and the main bundle are unaffected.
 */
export default function PublicLocationMap({ lat, lng, label }: { lat: number; lng: number; label?: string | null }) {
  const [ready, setReady] = useState(false);

  if (typeof window !== 'undefined') {
    const w = window as unknown as { __leafletLoading?: boolean; L?: unknown };
    if (!w.L && !w.__leafletLoading) {
      w.__leafletLoading = true;
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => setReady(true);
      js.onerror = () => {
        (window as unknown as { __leafletLoading?: boolean }).__leafletLoading = false;
      };
      document.head.appendChild(js);
    } else if (w.L) {
      if (!ready) setReady(true);
    }
  }

  const initRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !ready) return;
      const w = window as unknown as { L?: any };
      if (!w.L || (el as any).__mapInit) return;
      (el as any).__mapInit = true;
      const map = w.L.map(el, { scrollWheelZoom: false, dragging: false, doubleClickZoom: false, zoomControl: false }).setView([lat, lng], 15);
      w.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      const marker = w.L.marker([lat, lng]).addTo(map);
      if (label) marker.bindPopup(label);
    },
    [ready, lat, lng, label]
  );

  return (
    <div>
      <div ref={initRef} style={{ height: 280, width: '100%' }} />
      <p className="rounded-b-2xl bg-slate-900 px-3 py-1.5 text-[10px] text-slate-500">© OpenStreetMap</p>
    </div>
  );
}