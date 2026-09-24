'use client';

import { useEffect, useState } from 'react';
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
  onSelect,
  activeLabel,
}: {
  segments: Segment[];
  centerLabel?: string;
  centerValue?: number | string;
  size?: number;
  thickness?: number;
  /** Optional drill-down: turns every legend row into a real button. */
  onSelect?: (segment: Segment, index: number) => void;
  /** Highlighted segment label (controlled by the caller). */
  activeLabel?: string | null;
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
        strokeWidth={activeLabel === seg.label ? thickness + 4 : thickness}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        opacity={activeLabel && activeLabel !== seg.label ? 0.45 : 1}
        className="transition-[stroke-width,opacity] duration-300"
      >
        <title>{`${seg.label}: ${seg.value}`}</title>
      </circle>
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
        {segments.map((seg, i) => {
          const row = (
            <>
              <span className="flex items-center gap-2 text-slate-300">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: seg.color || PALETTE[i % PALETTE.length] }}
                />
                {seg.label}
              </span>
              <span className="font-semibold text-white">{seg.value}</span>
            </>
          );
          return (
            <li key={seg.label} className="text-sm">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(seg, i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-start transition hover:bg-slate-800/60 ${
                    activeLabel === seg.label ? 'bg-slate-800/70' : ''
                  }`}
                >
                  {row}
                </button>
              ) : (
                <span className="flex items-center justify-between gap-3">{row}</span>
              )}
            </li>
          );
        })}
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

export type BarSeries = { label: string; color: string };

/**
 * Inline SVG grouped bar chart — zero-dependency, RTL-safe and zero-baseline
 * aware: LOSS bars (negative net) grow BELOW the baseline instead of being
 * clipped. Bars animate on mount and each slot exposes a hover tooltip with the
 * exact figures (formatted by the caller through `formatValue`).
 */
export function BarChart({
  data,
  series,
  height = 200,
  formatValue = (n: number) => String(n),
  emptyLabel = 'لا توجد بيانات بعد.',
}: {
  data: { label: string; values: number[] }[];
  series: BarSeries[];
  height?: number;
  formatValue?: (n: number) => string;
  emptyLabel?: string;
}) {
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (data.length === 0) return <p className="text-sm text-slate-500">{emptyLabel}</p>;

  const all = data.flatMap((d) => d.values);
  const max = Math.max(0, ...all, 1);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  // Pre-mount: every value collapses onto the baseline (the grow-in animation).
  const yOf = (v: number) => (ready ? ((max - v) / span) * 100 : (max / span) * 100);
  const zeroY = yOf(0);
  const slot = 100 / data.length;
  const barW = Math.max(1.2, (slot * 0.7) / Math.max(series.length, 1));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <line
            x1={0}
            y1={zeroY}
            x2={100}
            y2={zeroY}
            stroke="rgba(148,163,184,0.35)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {data.map((d, i) => (
            <g key={`${d.label}-${i}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y={0} width={slot} height={100} fill="transparent" />
              {d.values.map((v, si) => {
                const y = yOf(v);
                const h = Math.max(0.4, Math.abs(y - zeroY));
                return (
                  <rect
                    key={series[si]?.label ?? si}
                    x={i * slot + slot * 0.15 + si * barW}
                    y={Math.min(y, zeroY)}
                    width={barW * 0.85}
                    height={h}
                    fill={series[si]?.color ?? PALETTE[si % PALETTE.length]}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    className="transition-[y,height,opacity] duration-700 ease-out"
                  />
                );
              })}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[9rem] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] shadow-xl"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <p className="mb-1 font-semibold text-slate-200">{data[hover].label}</p>
            {series.map((s, si) => (
              <p key={s.label} className="flex items-center justify-between gap-2 text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium text-white">{formatValue(data[hover].values[si] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {/* dir=ltr: bars are physical SVG coordinates (index 0 = oldest = leftmost),
          so the tick labels must follow the same physical order, not RTL flow. */}
      <div className="flex justify-between gap-1 text-[10px] text-slate-500" dir="ltr">
        {data.map((d, i) => (
          <span key={`${d.label}-axis-${i}`} className="flex-1 truncate text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
