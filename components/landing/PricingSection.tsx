'use client';

import { useState } from 'react';
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


export default function PricingSection() {
  const [interval, setInterval] = useState<Interval>('month');

  return (
    <section id="pricing" className="bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-10 text-center">
            <span className="mb-4 inline-block rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm font-semibold text-emerald-400">
              🎁 30 يوماً مجاناً — كل ميزات المتقدمة، بدون بطاقة
            </span>
            <h2 className="text-3xl font-black text-white md:text-5xl">اختر باقتك</h2>
            <p className="mt-3 text-lg text-slate-400">أسعار بالدولار الأمريكي • إلغاء في أي وقت</p>
          </div>
        </BlurFade>

        {/* Monthly / yearly toggle */}
        <BlurFade inView delay={0.05}>
          <div className="mb-12 flex justify-center">
            <div className="inline-flex rounded-full border border-slate-800 bg-slate-900/60 p-1">
              <button
                type="button"
                onClick={() => setInterval('month')}
                aria-pressed={interval === 'month'}
                className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                  interval === 'month' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                شهري
              </button>
              <button
                type="button"
                onClick={() => setInterval('year')}
                aria-pressed={interval === 'year'}
                className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                  interval === 'year' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                سنوي <span className="text-xs font-bold">(شهران مجاناً)</span>
              </button>
            </div>
          </div>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <BlurFade key={tier.id} delay={i * 0.12} inView className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-3xl border bg-slate-900/50 p-8 ${
                  tier.highlighted ? 'border-cyan-500/50' : 'border-slate-800'
                }`}
              >
                {tier.highlighted && (
                  <>
                    <ShineBorder borderWidth={2} duration={12} shineColor={['#10B981', '#0EA5E9', '#7C3AED']} />
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-1 text-sm font-bold text-white">
                      ⭐ الأكثر طلباً
                    </div>
                  </>
                )}
                <div className="mb-6">
                  <h3 className="mb-2 text-2xl font-bold text-white">{tier.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-cyan-300">
                      {interval === 'month' ? tier.monthly : tier.yearly}
                    </span>
                    <span className="text-slate-400">{interval === 'month' ? '/شهر' : '/سنة'}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{tier.note}</p>
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {tier.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-3 text-slate-300">
                      <span className="text-emerald-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Magnetic>
                  <Link href={`/register?plan=${planIdFor(tier.id, interval)}`} className="block">
                    <ShimmerButton className="w-full py-4 text-lg">اشترك الآن 🚀</ShimmerButton>
                  </Link>
                </Magnetic>
              </div>
            </BlurFade>
          ))}
        </div>

        <BlurFade inView delay={0.2}>
          <p className="mt-10 text-center text-sm text-slate-400">
            تبدأ بالتجربة المجانية 30 يوماً بكل ميزات المتقدمة.{' '}
            <Link href="/register?plan=free_trial" className="font-semibold text-cyan-300 underline">
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
