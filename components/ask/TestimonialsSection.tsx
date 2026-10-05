'use client';

import React from 'react';
import { Marquee } from '@/components/ui/marquee';
import { dedupeAskTestimonials } from '@/lib/services/askClinicPresentation';
import BeforeAfterSlider from '@/components/public/BeforeAfterSlider';

export default function TestimonialsSection({ testimonials }: { testimonials: Array<Record<string, unknown>> }) {
  const uniqueTestimonials = dedupeAskTestimonials(testimonials ?? []);
  if (!uniqueTestimonials.length) return null;
  const repeat = uniqueTestimonials.length < 4 ? 1 : 2;
  return (
    <section className="bg-blue-50/60 py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-12 text-center text-3xl font-black text-slate-900 md:text-4xl">⭐ تجارب مرضى يثقون بسنّي</h2>
        <Marquee pauseOnHover reverse repeat={repeat} className="gap-6 [--gap:1.5rem] [--duration:35s]">
          {uniqueTestimonials.map((t, i) => (
            <div key={String(t.id ?? `${t.patient_name}-${i}`)} className="w-72 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              {typeof t.before_image_url === 'string' && typeof t.after_image_url === 'string' && t.before_image_url && t.after_image_url ? (
                <BeforeAfterSlider before={t.before_image_url} after={t.after_image_url} title={String(t.patient_name ?? 'قصة نجاح')} />
              ) : typeof t.image_url === 'string' && t.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.image_url} alt={String(t.patient_name ?? 'مراجع')} className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
              ) : null}
              <div className="mb-3 text-amber-500">{'⭐'.repeat(Number(t.rating ?? 5))}</div>
              <p className="leading-6 text-slate-700">{String(t.content)}</p>
              {typeof t.outcome === 'string' && t.outcome && <p className="mt-2 text-sm font-semibold text-emerald-700">النتيجة: {t.outcome}</p>}
              <div className="mt-4 font-bold text-slate-800">— {String(t.patient_name)}</div>
              {(t.doctor_name || t.specialty) && <div className="text-xs text-slate-500">الطبيب: {String(t.doctor_name ?? '')}{t.specialty ? ` · ${String(t.specialty)}` : ''}</div>}
            </div>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
