'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { AnimatedBeam } from '@/components/ui/animated-beam';

const STEPS = [
  { n: '1', icon: '💬', title: 'المريض يراسل', desc: 'عبر الموقع أو واتساب — بأي وقت وبلغته.', color: 'from-cyan-400 to-blue-500' },
  { n: '2', icon: '🤖', title: 'AI يفهم ويرد', desc: 'يفهم المشكلة، يسأل، ويقترح أقرب طبيب.', color: 'from-purple-400 to-pink-500' },
  { n: '3', icon: '✅', title: 'الحجز يتم', desc: 'تأكيد فوري في جدولك — بدون تدخل يدوي.', color: 'from-emerald-400 to-green-500' },
];

/** كيف يعمل — ثلاث خطوات متصلة بـ Animated Beam. */
export default function HowItWorksSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const refs = [step1Ref, step2Ref, step3Ref];

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-0 h-72 w-72 rounded-full bg-violet-200/40 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-cyan-200/40 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <span className="mb-4 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1 text-sm font-semibold text-cyan-800">
            ⚡ كيف يعمل
          </span>
          <h2 className="text-3xl font-black text-slate-950 md:text-5xl">من الرسالة إلى الحجز</h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">ثلاث خطوات فقط — كل شيء تلقائي. أنت تتفرغ لمرضاك، والنظام لجميع الباقي.</p>
        </BlurFade>

        <div ref={containerRef} className="relative mt-16 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          <AnimatedBeam containerRef={containerRef} fromRef={step1Ref} toRef={step2Ref} curvature={-40} gradientStartColor="#0EA5E9" gradientStopColor="#7C3AED" duration={4} />
          <AnimatedBeam containerRef={containerRef} fromRef={step2Ref} toRef={step3Ref} curvature={-40} gradientStartColor="#7C3AED" gradientStopColor="#10B981" duration={4} delay={1} />

          {STEPS.map((s, i) => (
            <BlurFade key={s.n} delay={i * 0.08} inView>
              <div ref={refs[i]} className="group relative">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-300/20 to-violet-300/20 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <motion.div whileHover={{ y: -4 }} className="relative rounded-3xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm transition-all duration-300 group-hover:border-violet-300 group-hover:shadow-[0_16px_40px_-20px_rgba(139,92,246,0.4)]">
                  <div className={`absolute -top-4 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br ${s.color} font-bold text-white shadow-lg`}>
                    {s.n}
                  </div>
                  <div className={`mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br ${s.color} text-4xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
                    {s.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{s.title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{s.desc}</p>
                </motion.div>
              </div>
            </BlurFade>
          ))}
        </div>

        <BlurFade delay={0.6} inView>
          <div className="mt-16 flex justify-center">
            <Magnetic>
              <ShimmerButton className="px-8 py-4 text-lg">ابدأ الآن مجاناً 🚀</ShimmerButton>
            </Magnetic>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}