'use client';

import Link from 'next/link';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { PulsatingButton } from '@/components/ui/pulsating-button';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { Ripple } from '@/components/ui/ripple';

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-32">
      <div className="absolute inset-0 flex items-center justify-center">
        <Ripple number={6} color="rgba(16,185,129,0.35)" />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
        <BlurFade inView>
          <AnimatedShinyText className="inline-block text-3xl font-black text-white md:text-5xl">✨ جاهز تبدأ؟</AnimatedShinyText>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-300">انضم إلى أول 100 طبيب واستفد من سعر التأسيس مدى الحياة</p>
        </BlurFade>
        <BlurFade delay={0.4} inView>
          <div className="mt-12 flex justify-center">
            <Magnetic>
              <Link href="/register">
                <PulsatingButton className="px-12 py-6 text-xl">احجز مكانك الآن 🎯</PulsatingButton>
              </Link>
            </Magnetic>
          </div>
        </BlurFade>
        <BlurFade delay={0.6} inView>
          <p className="mt-8 text-sm text-slate-500">✓ بدون بطاقة ائتمان · ✓ إعداد في يوم واحد · ✓ إلغاء في أي وقت</p>
        </BlurFade>
      </div>
    </section>
  );
}
