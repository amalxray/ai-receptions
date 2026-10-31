'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShineBorder } from '@/components/ui/shine-border';
import { FOUNDING_SLOTS_TOTAL } from '@/lib/landing/landing-copy';
import { useLandingCopy } from '@/components/landing/LandingContent';

type TierId = 'basic' | 'advanced' | 'center';

type PricingTier = {
  id: TierId;
  title: string;
  note: string;
  features: string[];
  highlighted: boolean;
  buttonText: string;
};

const FOUNDING_OFFER: Record<TierId, { original: string; founding: string }> = {
  basic: { original: '$99', founding: '$39' },
  advanced: { original: '$179', founding: '$69' },
  center: { original: '$299', founding: '$119' },
};

const FOUNDING_BADGE = 'عرض التأسيس — مدى الحياة';

/**
 * Public landing pricing. The founding offer is presentation-only here; the
 * registration flow remains the authority for eligibility and account state.
 */
export default function PricingSection() {
  const copy = useLandingCopy();
  const pricing = copy.pricing;
  const [remaining, setRemaining] = useState(60);
  const reducedMotion = useReducedMotion();
  const tiers = pricing.tiers as PricingTier[];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/landing/founding-slots');
        const payload = await response.json();
        if (!cancelled && typeof payload.remaining === 'number') {
          setRemaining(Math.max(0, Math.min(FOUNDING_SLOTS_TOTAL, payload.remaining)));
        }
      } catch {
        // Keep the presentation fallback of 60 seats when the public counter is unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const usedSlots = Math.max(0, Math.min(FOUNDING_SLOTS_TOTAL, FOUNDING_SLOTS_TOTAL - remaining));
  const progressPercent = (usedSlots / FOUNDING_SLOTS_TOTAL) * 100;

  return (
    <section id="pricing" className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#D4AF37]/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-[#4F46E5]/15 blur-3xl" />
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-10 text-center">
            <span className="mb-4 inline-flex animate-pulse rounded-full border border-amber-300/70 bg-amber-50 px-4 py-1 text-sm font-black text-amber-700 motion-reduce:animate-none">
              ✦ {FOUNDING_BADGE} لأول 100 مشترك
            </span>
            <h2 className="text-3xl font-black text-slate-900 md:text-5xl">{pricing.title}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">ثبّت سعرك مدى الحياة، واحصل على استقبال ذكي يعمل 24/7 لعيادتك.</p>
          </div>
        </BlurFade>

        <BlurFade inView delay={0.05}>
          <div className="mx-auto mb-12 max-w-3xl rounded-3xl border border-amber-300/40 bg-gradient-to-l from-amber-50 via-white to-indigo-50 p-5 shadow-[0_18px_50px_-30px_rgba(79,70,229,0.55)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-black text-slate-900">🔥 المقاعد التأسيسية تتحرك بسرعة</p>
                <p className="mt-1 text-sm text-slate-600">تبقى <span className="font-mono font-black text-indigo-600">{remaining}</span> مقعداً من أصل {FOUNDING_SLOTS_TOTAL}</p>
              </div>
              <Link href="/register" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-amber-200 transition hover:-translate-y-0.5 hover:bg-indigo-700">ابدأ الآن ←</Link>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="المقاعد التأسيسية المستخدمة" aria-valuemin={0} aria-valuemax={FOUNDING_SLOTS_TOTAL} aria-valuenow={usedSlots}>
              <div className="h-full rounded-full bg-gradient-to-l from-[#D4AF37] via-amber-400 to-[#4F46E5] transition-[width] duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-3">
          {tiers.map((tier, index) => {
            const offer = FOUNDING_OFFER[tier.id];
            return (
              <BlurFade key={tier.id} delay={reducedMotion ? 0 : index * 0.08} inView className="h-full">
                <div
                  className={`relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none ${tier.highlighted ? 'ring-2 shadow-[0_0_40px_-10px_rgba(212,175,55,0.6)]' : 'border-[#E2E8F0]'}`}
                  style={tier.highlighted ? { borderColor: '#D4AF37', boxShadow: '0 0 40px -10px rgba(212,175,55,0.6)' } : undefined}
                >
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: index === 1 ? 'linear-gradient(90deg, #D4AF37, #4F46E5)' : index === 2 ? '#4F46E5' : '#D4AF37' }} />
                  <div className="absolute right-5 top-5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">{FOUNDING_BADGE}</div>
                  {tier.highlighted && (
                    <>
                      <ShineBorder borderWidth={2} duration={12} shineColor={['#D4AF37', '#4F46E5', '#10B981']} />
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-gradient-to-l from-[#D4AF37] to-amber-500 px-4 py-1 text-sm font-black text-slate-950">الأكثر طلباً</div>
                    </>
                  )}

                  <div className="mb-6 mt-10">
                    <h3 className="mb-2 text-2xl font-bold text-slate-900">{tier.title}</h3>
                    <div className="flex items-end gap-3">
                      <span className="text-xl font-semibold text-red-500 line-through decoration-1">{offer.original}</span>
                      <span className="text-5xl font-black text-emerald-600">{offer.founding}</span>
                      <span className="mb-1 text-sm text-slate-500">/شهر</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-amber-700">مدى الحياة لأول 100 مشترك</p>
                    <p className="mt-1 text-sm text-slate-500">{tier.note}</p>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {tier.features.map((feature, featureIndex) => (
                      <li key={`${tier.id}-${featureIndex}`} className="flex items-start gap-3 text-slate-700">
                        <span className="font-black text-emerald-600">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Magnetic>
                    <Link href={`/register?plan=${tier.id}`} className="relative block overflow-hidden rounded-full bg-gradient-to-l from-[#D4AF37] to-[#4F46E5] px-6 py-4 text-center text-lg font-black text-white transition hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(79,70,229,0.3)] motion-reduce:transform-none">
                      <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-white/25" style={{ animation: tier.highlighted ? 'pricing-shimmer 2.8s linear infinite' : undefined }} />
                      <span className="relative">{tier.buttonText || 'ابدأ الآن'}</span>
                    </Link>
                  </Magnetic>
                </div>
              </BlurFade>
            );
          })}
        </div>

        <BlurFade inView delay={0.2}>
          <p className="mt-10 text-center text-sm text-slate-600">
            {pricing.footerText}{' '}
            <Link href="/register" className="font-semibold text-indigo-700 underline hover:text-slate-900">{pricing.footerLinkText}</Link>
          </p>
        </BlurFade>
      </div>
      <style jsx global>{`@keyframes pricing-shimmer { 0% { transform: translateX(120%); } 100% { transform: translateX(-120%); } }`}</style>
    </section>
  );
}
