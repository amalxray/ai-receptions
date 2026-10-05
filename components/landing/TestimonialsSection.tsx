'use client';

import { AvatarCircles } from '@/components/ui/avatar-circles';
import { BlurFade } from '@/components/ui/blur-fade';
import { Marquee } from '@/components/ui/marquee';
import { useLandingCopy } from '@/components/landing/LandingContent';

const CARD_COLORS = ['from-cyan-400 to-blue-500', 'from-violet-400 to-purple-500', 'from-emerald-400 to-teal-500', 'from-amber-400 to-orange-500', 'from-pink-400 to-rose-500'];

export default function TestimonialsSection() {
  const copy = useLandingCopy();
  const testimonials = copy.testimonials;
  return (
    <section className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-violet-200/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-amber-100/60 blur-[100px]" />
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-slate-950 md:text-5xl">{testimonials.title}</h2>
            <p className="mt-3 text-lg text-slate-600">{testimonials.subtitle}</p>
          </div>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <div className="mb-12 flex justify-center">
            <AvatarCircles numPeople={99} avatarUrls={['/icons/icon-192.png', '/icons/icon-512.png']} className="mb-0" />
          </div>
        </BlurFade>

        <div className="relative">
          <div className="absolute bottom-0 left-0 top-0 z-10 w-24 bg-gradient-to-l from-[#FAFBFC] to-transparent" />
          <div className="absolute bottom-0 right-0 top-0 z-10 w-24 bg-gradient-to-r from-[#FAFBFC] to-transparent" />
          <Marquee pauseOnHover repeat={2} className="[--duration:45s]">
            {testimonials.items.map((raw: { content?: string; text?: string; doctor_name?: string; name?: string; specialty?: string; rating?: number; image_url?: string }, i: number) => {
              const doctorName = String(raw.doctor_name ?? raw.name ?? 'طبيب');
              const testimonialText = String(raw.content ?? raw.text ?? '');
              const rating = Math.max(1, Math.min(5, Number(raw.rating) || 5));
              return <BlurFade key={`${doctorName}-${i}`} delay={i * 0.08} inView>
                <article className="group mx-4 w-96 shrink-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-[0_16px_40px_-18px_rgba(245,158,11,0.28)]">
                  <div aria-label={`تقييم ${rating} من 5`} className="mb-3 text-amber-500">{'⭐'.repeat(rating)}</div>
                  <p className="mb-4 text-lg leading-7 text-slate-700">“{testimonialText}”</p>
                  <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                    {raw.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={raw.image_url} alt={doctorName} className="h-12 w-12 rounded-full object-cover shadow-md ring-2 ring-white" />
                    ) : (
                      <div aria-hidden="true" className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br ${CARD_COLORS[i % CARD_COLORS.length]} font-bold text-white shadow-md ring-2 ring-white`}>{doctorName.replace('د. ', '').charAt(0)}</div>
                    )}
                    <div>
                      <div className="font-bold text-slate-900">{doctorName}</div>
                      <div className="text-xs text-slate-500">{raw.specialty ?? ''}</div>
                    </div>
                  </div>
                </article>
              </BlurFade>;
            })}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
