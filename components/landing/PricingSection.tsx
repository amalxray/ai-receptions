'use client';

import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { ShineBorder } from '@/components/ui/shine-border';

// plan ids map to the register flow (?plan=… mirrors billing plan keys).
const PLANS = [
  {
    id: 'founding',
    title: 'التأسيس',
    price: '$50',
    note: 'ثابت مدى الحياة — لأول 100 طبيب',
    features: ['كل الميزات الكاملة', 'سعر ثابت للأبد', 'دعم أولوية', 'QR + واتساب', 'تحليلات كاملة'],
    highlighted: true,
  },
  {
    id: 'growth',
    title: 'النمو',
    price: '$120',
    note: 'نفس الميزات بدون خصم التأسيس',
    features: ['كل الميزات الكاملة', 'تحديثات مستمرة', 'دعم عبر المحادثة', 'QR + واتساب'],
    highlighted: false,
  },
  {
    id: 'pro',
    title: 'الاحترافية',
    price: 'مخصص',
    note: 'لمجموعات العيادات والسلاسل',
    features: ['عدة فروع وحسابات', 'تكاملات مخصصة', 'مدير حساب مخصص', 'تقارير موسعة'],
    highlighted: false,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-sm font-semibold text-amber-400">⚡ عرض التأسيس — أول 100 طبيب</span>
            <h2 className="text-3xl font-black text-white md:text-5xl">اختر باقتك</h2>
            <p className="mt-3 text-lg text-slate-400">سعر ثابت مدى الحياة لباقة التأسيس</p>
          </div>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <BlurFade key={plan.title} delay={i * 0.12} inView className="h-full">
              <div className={`relative flex h-full flex-col rounded-3xl border bg-slate-900/50 p-8 ${plan.highlighted ? 'border-cyan-500/50' : 'border-slate-800'}`}>
                {plan.highlighted && (
                  <>
                    <ShineBorder borderWidth={2} duration={12} shineColor={['#10B981', '#0EA5E9', '#7C3AED']} />
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-1 text-sm font-bold text-white">⭐ الأكثر طلباً</div>
                  </>
                )}
                <div className="mb-6">
                  <h3 className="mb-2 text-2xl font-bold text-white">{plan.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-cyan-300">{plan.price}</span>
                    {plan.price !== 'مخصص' && <span className="text-slate-400">/شهر</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{plan.note}</p>
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-3 text-slate-300"><span className="text-emerald-400">✓</span><span>{f}</span></li>
                  ))}
                </ul>
                <Magnetic>
                  <Link href={plan.price === 'مخصص' ? '/register?plan=pro&contact=sales' : `/register?plan=${plan.id}`} className="block">
                    <ShimmerButton className="w-full py-4 text-lg">
                      {plan.price === 'مخصص' ? 'تواصل معنا 📞' : 'اشترك الآن 🚀'}
                    </ShimmerButton>
                  </Link>
                </Magnetic>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
