'use client';

import { ArrowUpLeft, Sparkles } from 'lucide-react';

const buttons = [
  {
    name: 'أساسي · Gradient',
    description: 'تدرّج سماوي إلى زمردي',
    element: <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-cyan-400 to-emerald-400 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_35px_-12px_rgba(45,212,191,0.8)] active:translate-y-0"><Sparkles size={16} /> ابدأ الآن</button>,
  },
  {
    name: 'ثانوي · Outline Glow',
    description: 'إطار يضيء عند المرور',
    element: <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-transparent px-5 py-3 text-sm font-bold text-cyan-100 transition duration-300 hover:border-cyan-200 hover:bg-cyan-300/[0.07] hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.65)] active:scale-[0.98]">اعرف المزيد <ArrowUpLeft size={15} /></button>,
  },
  {
    name: 'زجاجي · Glass',
    description: 'شفافية هادئة وطبقة ضبابية',
    element: <button className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-bold text-white shadow-inner shadow-white/5 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.13] active:scale-[0.98]">اكتشف <Sparkles size={15} /></button>,
  },
  {
    name: 'نيون · Neon',
    description: 'وهج زمردي عند المرور',
    element: <button className="rounded-xl border border-emerald-300/50 bg-emerald-400/10 px-5 py-3 text-sm font-extrabold text-emerald-200 transition duration-300 hover:border-emerald-200 hover:bg-emerald-300/15 hover:text-white hover:shadow-[0_0_14px_rgba(52,211,153,0.65),0_0_42px_rgba(52,211,153,0.3)]">احجز موعدًا</button>,
  },
];

export default function ButtonsShowcase() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {buttons.map((button) => (
        <article key={button.name} className="flex min-h-40 flex-col justify-between gap-5 rounded-2xl border border-white/[0.06] bg-slate-950/55 p-4">
          <div><h3 className="text-sm font-bold text-slate-200">{button.name}</h3><p className="mt-1 text-xs text-slate-600">{button.description}</p></div>
          <div className="flex min-h-14 items-center justify-center rounded-xl bg-white/[0.018]">{button.element}</div>
        </article>
      ))}
    </div>
  );
}
