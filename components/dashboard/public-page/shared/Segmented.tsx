'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

type Props<T extends string | number> = {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  groupId: string;
};

/**
 * Segmented control (ب2): كبسات كبيرة بديلة عن <select> الجافة.
 * بصري فقط — القيم المحفوظة نفسها دون تغيير.
 */
export default function Segmented<T extends string | number>({ value, onChange, options, label, groupId }: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === value);
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : -1;
    const next = options[(idx + dir + options.length) % options.length];
    onChange(next.value);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
    btn?.focus();
  }

  return (
    <div>
      <span id={`${groupId}-label`} className="mb-1.5 block text-sm font-medium text-slate-400">
        {label}
      </span>
      <div
        ref={listRef}
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-1.5"
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <motion.button
              key={String(opt.value)}
              type="button"
              role="radio"
              data-value={opt.value}
              aria-checked={selected}
              aria-label={opt.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(opt.value)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`relative flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-white/10 ${
                selected
                  ? 'bg-gradient-to-l from-cyan-500/20 to-emerald-500/10 text-white ring-1 ring-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                  : 'text-slate-300'
              }`}
            >
              {selected && (
                <motion.span
                  layoutId={`seg-indicator-${groupId}`}
                  className="absolute inset-0 rounded-xl ring-1 ring-cyan-400/40"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{opt.label}</span>
              {opt.hint ? <span className="relative ml-1 text-xs text-slate-500">{opt.hint}</span> : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
