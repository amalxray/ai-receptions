'use client';

import { BorderBeam } from '@/components/ui/border-beam';

export type Segment = { label: string; value: number; color: string };

const PALETTE = ['#06b6d4', '#34d399', '#f5a623', '#8b5cf6', '#f472b6', '#38bdf8'];

/** Inline SVG donut — no chart dependency. */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 200,
  thickness = 22,
}: {
  segments: Segment[];
  centerLabel?: string;
  centerValue?: number | string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  const arcs = segments.map((seg, i) => {
    const frac = total > 0 ? seg.value / total : 0;
    const dash = frac * c;
    const offset = -acc * c;
    acc += frac;
    return (
      <circle
        key={seg.label}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={seg.color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
      />
    );
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={thickness} />
          {arcs}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-bold text-white">{centerValue ?? total}</p>
            {centerLabel && <p className="text-xs text-slate-400">{centerLabel}</p>}
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {segments.map((seg, i) => (
          <li key={seg.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: seg.color || PALETTE[i % PALETTE.length] }}
              />
              {seg.label}
            </span>
            <span className="font-semibold text-white">{seg.value}</span>
          </li>
        ))}
        {segments.length === 0 && <li className="text-sm text-slate-500">لا توجد بيانات بعد.</li>}
      </ul>
    </div>
  );
}

/** Horizontal bar list — pure CSS, RTL-safe (value chip on the outer edge). */
export function BarList({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-4">
      {items.map((item, i) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="truncate text-slate-300">{item.label}</span>
            <span className="font-semibold text-white">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color || PALETTE[i % PALETTE.length],
              }}
            />
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="text-sm text-slate-500">لا توجد بيانات بعد.</li>}
    </ul>
  );
}

/** Glass panel wrapper used across the owner dashboard cards. */
export function Panel({
  title,
  hint,
  children,
  className = '',
  beam = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  beam?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6 ${className}`}
    >
      {beam && <BorderBeam size={180} duration={14} colorFrom="#f5a623" colorTo="#06b6d4" />}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}