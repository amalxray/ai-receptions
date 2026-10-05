'use client';

import { useState } from 'react';

export type BeforeAfterItem = {
  id: string;
  before_url: string;
  after_url: string;
  title?: string;
};

export default function BeforeAfterSection({ items }: { items: BeforeAfterItem[] }) {
  // Temporary frontend-only demo data for preview when clinic records are empty.
  const safeItems = items.length
    ? items
    : [
        {
          id: 'demo-before-after-1',
          title: 'حالة علاجية تحسّنت بشكل واضح',
          before_url: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80',
          after_url: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80',
        },
        {
          id: 'demo-before-after-2',
          title: 'نتيجة تجميلية أكثر توازنًا',
          before_url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80',
          after_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80',
        },
      ];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-12">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-black text-slate-800 sm:text-3xl">قبل وبعد</h2>
        <p className="mt-2 text-sm text-slate-500">اسحب المقارنة لترى النتائج الحقيقية في لمحة واحدة.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {safeItems.map((item) => (
          <ComparisonCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({ item }: { item: BeforeAfterItem }) {
  const [value, setValue] = useState(56);

  return (
    <div className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(8,145,178,0.18)]">
      <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img src={item.before_url} alt={`${item.title ?? 'قبل'} — قبل`} className="h-full w-full object-cover" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${value}%` }}
          >
            <img src={item.after_url} alt={`${item.title ?? 'بعد'} — بعد`} className="h-full w-full object-cover" />
          </div>

          <div className="absolute inset-y-0 left-0 flex items-center" style={{ width: `${value}%` }}>
            <div className="h-full w-px bg-white/80 shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
          </div>

          <div
            className="absolute inset-y-0 flex items-center justify-center"
            style={{ left: `calc(${value}% - 18px)` }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-900/80 text-lg text-white shadow-lg shadow-cyan-500/20">
              ↔
            </div>
          </div>

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
            <span className="rounded-full bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold text-white">قبل</span>
            <span className="rounded-full bg-cyan-500/90 px-2.5 py-1 text-[10px] font-bold text-white">بعد</span>
          </div>
        </div>

        <input
          aria-label={`قيمة المقارنة لـ ${item.title ?? 'الحالة'}`}
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="before-after-range absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      {item.title && (
        <div className="mt-4 flex items-center justify-between px-1">
          <h3 className="text-base font-bold text-slate-800">{item.title}</h3>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">نتيجة حقيقية</span>
        </div>
      )}
    </div>
  );
}
