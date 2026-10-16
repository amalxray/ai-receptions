import React from 'react';

/** Section card (moved verbatim from PublicPageManager). */
export default function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/85 p-5 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-cyan-500/10">
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
