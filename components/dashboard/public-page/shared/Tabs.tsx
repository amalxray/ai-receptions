'use client';

import React from 'react';

import { useRef } from 'react';

export type PublicPageTabKey = 'identity' | 'appearance' | 'content' | 'share';

const TABS: { key: PublicPageTabKey; label: string }[] = [
  { key: 'identity', label: 'الهوية' },
  { key: 'appearance', label: 'المظهر' },
  { key: 'content', label: 'المحتوى' },
  { key: 'share', label: 'المشاركة' },
];

export function Tabs({ active, onChange }: { active: PublicPageTabKey; onChange: (t: PublicPageTabKey) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.key === active);
    const dir = e.key === 'ArrowLeft' ? 1 : -1;
    const next = TABS[(idx + dir + TABS.length) % TABS.length];
    onChange(next.key);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`);
    btn?.focus();
  }

  return (
    <div ref={listRef} role="tablist" aria-label="أقسام الصفحة العامة"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-1.5">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab={tab.key}
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            id={`tab-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={isActive
              ? 'rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950'
              : 'rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/70'}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
