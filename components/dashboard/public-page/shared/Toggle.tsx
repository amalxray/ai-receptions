'use client';

import React from 'react';

/** Toggle switch (moved verbatim from PublicPageManager). */
export default function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300 hover:ring-2 hover:ring-cyan-500/30">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-all ${checked ? 'bg-gradient-to-l from-cyan-500 to-emerald-500' : 'bg-slate-800'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'left-0.5'}`}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}
