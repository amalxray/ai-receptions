'use client';

import { useState } from 'react';

/**
 * BEFORE/AFTER SLIDER — draggable comparison for public case showcases.
 * RTL-first: «قبل» sits on the RIGHT (first in Arabic reading order) and
 * «بعد» on the left; the range input is dir="ltr" so its value maps linearly
 * to the clip percentage with no visual mirroring surprises.
 */
export default function BeforeAfterSlider({
  before,
  after,
  title,
}: {
  before: string;
  after: string;
  title: string;
}) {
  const [pos, setPos] = useState(50); // % of width showing «بعد» (from left)

  return (
    <figure className="public-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div dir="ltr" className="relative aspect-[4/3] select-none">
        {/* قبل — base layer, fills everything */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${title} — قبل`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {/* بعد — clipped from the right edge; pos% visible from the left */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={after}
          alt={`${title} — بعد`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700 shadow">
            ↔
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
          aria-label={`مقارنة قبل وبعد — ${title}`}
        />
        <span className="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white">قبل</span>
        <span className="absolute left-3 top-3 z-10 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-bold text-white">بعد</span>
      </div>
      <figcaption className="p-4">
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </figcaption>
    </figure>
  );
}