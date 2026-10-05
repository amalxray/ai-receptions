'use client';

import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { ShineBorder } from '@/components/ui/shine-border';
import { useLandingCopy } from '@/components/landing/LandingContent';

/**
 * Public pricing grid — v2 catalog (USD).
 *
 * DISPLAY ONLY. The authoritative prices live in:
 *   1. public.billing_plans      (DB catalog, migration 20260922)
 *   2. lib/subscription/plans.ts (static fallback)
 * This component must always mirror them (see docs/SUBSCRIPTION_PLANS.md).
 *
 * `id` maps to the register flow (?plan=…) and to the billing plan keys used by
 * SUBSCRIPTION_PLANS. The yearly ids are <tier>_yearly.
 */
type Interval = 'month' | 'year';

export default function PricingSection() {
  const copy = useLandingCopy();
  const pricing = copy.pricing;
  const [interval, setInterval] = useState<Interval>('month');
  const reducedMotion = useReducedMotion();

  return (
    <section id="pricing" className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#8B5CF6]/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-[#0EA5E9]/15 blur-3xl" />
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-10 text-center">
            <span className="mb-4 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-sm font-semibold text-emerald-700">
              {pricing.badge}
            </span>
            <h2 className="text-3xl font-black text-slate-900 md:text-5xl">{pricing.title}</h2>
            <p className="mt-3 text-lg text-slate-600">{pricing.yearlyNote}</p>
          </div>
        </BlurFade>

        {/* Monthly / yearly toggle */}
        <BlurFade inView delay={0.05}>
          <div className="mb-12 flex justify-center">
            <div className="inline-flex rounded-full border border-[#E2E8F0] bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setInterval('month')}
                aria-pressed={interval === 'month'}
                className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                  interval === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {pricing.monthlyLabel}
              </button>
              <button
                type="button"
                onClick={() => setInterval('year')}
                aria-pressed={interval === 'year'}
                className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                  interval === 'year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {pricing.yearlyLabel}
              </button>
            </div>
          </div>
        </BlurFade>

        <div className="mb-8 flex flex-col items-center justify-between gap-4 rounded-2xl border p-4 md:flex-row md:p-5" style={{ borderColor: 'color-mix(in srgb, var(--landing-primary) 30%, transparent)', background: 'linear-gradient(to right, color-mix(in srgb, var(--landing-primary) 10%, transparent), color-mix(in srgb, var(--landing-secondary) 10%, transparent), transparent)' }}>
          <div className="flex items-center gap-3"><span className="text-2xl">🎁</span><div><p className="font-bold text-slate-900">{pricing.trialTitle}</p><p className="text-sm text-slate-600">{pricing.trialDescription}</p></div></div>
          <Link href="/register?plan=free_trial" className="whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: 'var(--landing-cta)' }}>{pricing.trialCta}</Link>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {pricing.tiers.map((tier: { id: 'basic' | 'advanced' | 'center'; title: string; monthly: string; yearly: string; note: string; features: string[]; highlighted: boolean; buttonText: string }, i: number) => (
            <BlurFade key={tier.id} delay={reducedMotion ? 0 : i * 0.08} inView className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none ${
                    tier.highlighted ? 'ring-2 shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)]' : ''
                }`}
                style={tier.highlighted ? { borderColor: 'var(--landing-primary)', boxShadow: '0 0 40px -10px color-mix(in srgb, var(--landing-primary) 50%, transparent)' } : undefined}
              >
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ backgroundColor: i === 0 ? 'var(--landing-primary)' : i === 1 ? 'var(--landing-secondary)' : 'var(--landing-cta)' }} />
                {tier.highlighted && (
                  <>
                    <ShineBorder borderWidth={2} duration={12} shineColor={['#10B981', '#0EA5E9', '#7C3AED']} />
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-sm font-bold text-white" style={{ backgroundColor: 'var(--landing-primary)' }}>
                      {pricing.highlightedLabel}
                    </div>
                  </>
                )}
                <div className="mb-6">
                  <h3 className="mb-2 text-2xl font-bold text-slate-900">{tier.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-slate-900">
                      {interval === 'month' ? tier.monthly : tier.yearly}
                    </span>
                    <span className="text-sm text-slate-500">{interval === 'month' ? '/شهر' : '/سنة'}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{tier.note}</p>
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-3 text-slate-700">
                      <span className="text-emerald-600">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Magnetic>
                  <Link href={`/register?plan=${planIdFor(tier.id, interval)}`} className="block">
                    <ShimmerButton style={{ background: tier.highlighted ? 'linear-gradient(90deg, var(--landing-primary), var(--landing-secondary))' : 'var(--landing-cta)' }} className={`w-full py-4 text-lg transition hover:scale-[1.02] hover:shadow-[0_0_22px_rgba(139,92,246,0.25)] motion-reduce:transform-none motion-reduce:transition-none ${tier.highlighted ? 'animate-pulse motion-reduce:animate-none' : ''}`}>{tier.buttonText}</ShimmerButton>
                  </Link>
                </Magnetic>
              </div>
            </BlurFade>
          ))}
        </div>

        <BlurFade inView delay={0.2}>
          <p className="mt-10 text-center text-sm text-slate-600">
            {pricing.footerText}{' '}
            <Link href="/register?plan=free_trial" className="font-semibold text-slate-700 underline hover:text-slate-900">
              {pricing.footerLinkText}
            </Link>
          </p>
        </BlurFade>
      </div>
    </section>
  );
}

/** Plan id sent to the register flow for the selected billing interval. */
function planIdFor(tierId: string, interval: Interval): string {
  return interval === 'year' ? `${tierId}_yearly` : tierId;
}
