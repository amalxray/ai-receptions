'use client';

import { useRef, type MouseEvent } from 'react';
import { NumberTicker } from '@/components/ui/number-ticker';

type Accent = 'cyan' | 'emerald' | 'amber' | 'violet';

type StatTileProps = {
  title: string;
  value: number;
  suffix?: string;
  icon: string;
  trend?: string;
  accent?: Accent;
};

const ACCENTS: Record<Accent, { glow: string; text: string; ring: string; chip: string }> = {
  cyan: {
    glow: 'rgba(6,182,212,0.18)',
    text: 'text-cyan-300',
    ring: 'hover:border-cyan-400/50',
    chip: 'bg-cyan-500/10 text-cyan-300',
  },
  emerald: {
    glow: 'rgba(52,211,153,0.18)',
    text: 'text-emerald-300',
    ring: 'hover:border-emerald-400/50',
    chip: 'bg-emerald-500/10 text-emerald-300',
  },
  amber: {
    glow: 'rgba(245,166,35,0.20)',
    text: 'text-amber-300',
    ring: 'hover:border-amber-400/50',
    chip: 'bg-amber-500/10 text-amber-300',
  },
  violet: {
    glow: 'rgba(139,92,246,0.20)',
    text: 'text-violet-300',
    ring: 'hover:border-violet-400/50',
    chip: 'bg-violet-500/10 text-violet-300',
  },
};

/**
 * OWNER-DASHBOARD STAT TILE — spotlight follows the cursor via a CSS custom
 * property (no re-render per move). Value animates with NumberTicker.
 */
export default function StatTile({ title, value, suffix = '', icon, trend, accent = 'cyan' }: StatTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const a = ACCENTS[accent];

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition-colors duration-300 ${a.ring}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(220px circle at var(--mx, 50%) var(--my, 0%), ${a.glow}, transparent 65%)`,
        }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-3xl">{icon}</span>
        {trend && (
          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${a.chip}`}>{trend}</span>
        )}
      </div>
      <div className={`relative mt-3 flex items-baseline gap-1 text-3xl font-bold ${a.text}`}>
        <NumberTicker value={value} />
        {suffix && <span className="text-lg">{suffix}</span>}
      </div>
      <p className="relative mt-1 text-sm text-slate-400">{title}</p>
    </div>
  );
}