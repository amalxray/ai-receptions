'use client';

import { Marquee } from '@/components/ui/marquee';

export default function TestimonialsSection({ testimonials }: { testimonials: Array<Record<string, unknown>> }) {
  if (!testimonials?.length) return null;
  return (
    <section className="py-20" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-12 text-center text-3xl md:text-4xl font-black text-white">⭐ آراء المرضى</h2>
        <Marquee pauseOnHover reverse className="[--duration:35s]">
          {testimonials.map((t, i) => (
            <div key={i} className="mx-4 w-80 rounded-2xl bg-slate-800 p-6">
              <div className="mb-3 text-amber-400">{'⭐'.repeat(Number(t.rating ?? 5))}</div>
              <p className="leading-6 text-slate-200">{String(t.content)}</p>
              <div className="mt-4 font-bold text-slate-100">— {String(t.patient_name)}</div>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
