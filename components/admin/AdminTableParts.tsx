'use client';

import { Search } from 'lucide-react';

/** Rounded search box for admin tables (RTL-first). */
export function SearchInput({
  value,
  onChange,
  placeholder = 'ابحث…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2 pr-9 pl-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-400/60 sm:w-64"
      />
    </label>
  );
}

/** Native select styled to match the owner theme. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      {label && <span className="shrink-0">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-400/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'owner';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-300',
  success: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  danger: 'bg-rose-500/15 text-rose-300',
  info: 'bg-cyan-500/15 text-cyan-300',
  owner: 'bg-gradient-to-l from-amber-500/25 to-amber-500/10 text-amber-200 ring-1 ring-inset ring-amber-400/40',
};

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Initial-based avatar — avoids remote image dependencies in the dashboard. */
export function Avatar({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${TONES[tone]}`}
      aria-hidden
    >
      {label.trim().charAt(0).toUpperCase() || '؟'}
    </span>
  );
}

/** Table shell — horizontal scroll on narrow screens. */
export function DataTableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
      <table className="w-full min-w-[640px] border-collapse text-right text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-800 bg-slate-900/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-b border-slate-800/70 px-4 py-3 align-middle text-slate-200 ${className}`}>{children}</td>;
}

/** Empty / loading row spanning the whole table. */
export function TableMessage({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}