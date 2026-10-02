'use client';

import { Marquee } from '@/components/ui/marquee';

export default function TestimonialsSection({ testimonials }: { testimonials: Array<Record<string, unknown>> }) {
  if (!testimonials?.length) return null;
  return (
    <section className="bg-blue-50/60 py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-12 text-center text-3xl font-black text-slate-900 md:text-4xl">⭐ تجارب مرضى يثقون بسنّي</h2>
        <Marquee pauseOnHover reverse repeat={2} className="gap-6 [--gap:1.5rem] [--duration:35s]">
          {testimonials.map((t, i) => (
            <div key={String(t.id ?? `${t.patient_name}-${i}`)} className="w-72 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 text-amber-500">{'⭐'.repeat(Number(t.rating ?? 5))}</div>
              <p className="leading-6 text-slate-700">{String(t.content)}</p>
              <div className="mt-4 font-bold text-slate-800">— {String(t.patient_name)}</div>
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
