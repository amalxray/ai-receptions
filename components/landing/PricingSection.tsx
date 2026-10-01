'use client';

import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { ShineBorder } from '@/components/ui/shine-border';

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

const TIERS = [
  {
    id: 'basic',
    title: 'أساسية',
    monthly: '$39',
    yearly: '$399',
    note: 'عيادة واحدة — للممارسة الفردية',
    features: ['عيادة واحدة', 'حتى 500 مريض', 'مستخدم واحد', 'محادثات AI غير محدودة'],
    highlighted: false,
  },
  {
    id: 'advanced',
    title: 'متقدمة',
    monthly: '$69',
    yearly: '$699',
    note: 'الأنسب لعيادة متعددة الأطباء',
    features: [
      'عيادات متعددة',
      'مرضى غير محدود',
      '4 مستخدمين',
      'فواتير ومدفوعات',
      'واتساب + إشعارات',
      'تقارير',
    ],
    highlighted: true,
  },
  {
    id: 'center',
    title: 'مركز',
    monthly: '$119',
    yearly: '$1199',
    note: 'لمراكز الأشعة والمختبرات والسلاسل',
    features: [
      'عيادات غير محدودة',
      '10 مستخدمين',
      'قبل/بعد Gallery',
      'شارات إنجازات',
      'تحليلات متقدمة',
      'أولوية الدعم',
    ],
    highlighted: false,
  },
];
const ACCENTS = ['bg-[#3B82F6]', 'bg-[#8B5CF6]', 'bg-[#F59E0B]'];


export default function PricingSection() {
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
              🎁 30 يوماً مجاناً — كل ميزات المتقدمة، بدون بطاقة
            </span>
            <h2 className="text-3xl font-black text-slate-900 md:text-5xl">اختر باقتك</h2>
            <p className="mt-3 text-lg text-slate-600">أسعار بالدولار الأمريكي • إلغاء في أي وقت</p>
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
                شهري
              </button>
              <button
                type="button"
                onClick={() => setInterval('year')}
                aria-pressed={interval === 'year'}
                className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                  interval === 'year' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                سنوي <span className="text-xs font-bold">(شهران مجاناً)</span>
              </button>
            </div>
          </div>
        </BlurFade>

        <div className="mb-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#8B5CF6]/30 bg-gradient-to-r from-[#8B5CF6]/10 via-[#0EA5E9]/10 to-transparent p-4 md:flex-row md:p-5">
          <div className="flex items-center gap-3"><span className="text-2xl">🎁</span><div><p className="font-bold text-slate-900">جرّب 30 يوماً مجاناً</p><p className="text-sm text-slate-600">كل ميزات "متقدمة" — بدون بطاقة ائتمانية</p></div></div>
          <Link href="/register?plan=free_trial" className="whitespace-nowrap rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">ابدأ الآن</Link>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <BlurFade key={tier.id} delay={reducedMotion ? 0 : i * 0.08} inView className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none ${
                  tier.highlighted ? 'ring-2 ring-[#8B5CF6]/40 shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)]' : ''
                }`}
              >
                <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl ${ACCENTS[i]}`} />
                {tier.highlighted && (
                  <>
                    <ShineBorder borderWidth={2} duration={12} shineColor={['#10B981', '#0EA5E9', '#7C3AED']} />
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#8B5CF6] px-4 py-1 text-sm font-bold text-white">
                      ⭐ الأكثر اختياراً
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
                    <ShimmerButton style={{ background: tier.highlighted ? 'linear-gradient(90deg, #8B5CF6, #0EA5E9)' : '#0F172A' }} className={`w-full py-4 text-lg transition hover:scale-[1.02] hover:shadow-[0_0_22px_rgba(139,92,246,0.25)] motion-reduce:transform-none motion-reduce:transition-none ${tier.highlighted ? 'animate-pulse motion-reduce:animate-none' : ''}`}>اشترك الآن 🚀</ShimmerButton>
                  </Link>
                </Magnetic>
              </div>
            </BlurFade>
          ))}
        </div>

        <BlurFade inView delay={0.2}>
          <p className="mt-10 text-center text-sm text-slate-600">
            تبدأ بالتجربة المجانية 30 يوماً بكل ميزات المتقدمة.{' '}
            <Link href="/register?plan=free_trial" className="font-semibold text-slate-700 underline hover:text-slate-900">
              ابدأ التجربة المجانية
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
