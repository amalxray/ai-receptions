'use client';

import { useRef } from 'react';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { AnimatedBeam } from '@/components/ui/animated-beam';

const STEPS = [
  { n: '1', icon: '💬', title: 'المريض يراسل', desc: 'عبر الموقع أو واتساب — بأي وقت وبلغته.', color: 'from-cyan-400 to-blue-500' },
  { n: '2', icon: '🤖', title: 'AI يفهم ويرد', desc: 'يفهم المشكلة، يسأل، ويقترح أقرب طبيب.', color: 'from-purple-400 to-pink-500' },
  { n: '3', icon: '✅', title: 'الحجز يتم', desc: 'تأكيد فوري في جدولك — بدون تدخل يدوي.', color: 'from-emerald-400 to-green-500' },
];

/** كيف يعمل — 3 خطوات متصلة بـ Animated Beam (dark). */
export default function HowItWorksSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const refs = [step1Ref, step2Ref, step3Ref];

  return (
    <section className="relative overflow-hidden bg-slate-950 py-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.6) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.75)_100%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <span className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm font-semibold text-cyan-300">
            ⚡ كيف يعمل
          </span>
          <h2 className="text-3xl font-black text-white md:text-5xl">من الرسالة إلى الحجز</h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-400">ثلاث خطوات فقط — كل شيء تلقائي. أنت تتفرغ لمرضاك، والنظام لجميع الباقي.</p>
        </BlurFade>

        <div ref={containerRef} className="relative mt-16 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          <AnimatedBeam containerRef={containerRef} fromRef={step1Ref} toRef={step2Ref} curvature={-40} gradientStartColor="#0EA5E9" gradientStopColor="#7C3AED" duration={4} />
          <AnimatedBeam containerRef={containerRef} fromRef={step2Ref} toRef={step3Ref} curvature={-40} gradientStartColor="#7C3AED" gradientStopColor="#10B981" duration={4} delay={1} />

          {STEPS.map((s, i) => (
            <BlurFade key={s.n} delay={i * 0.2} inView>
              <div ref={refs[i]} className="group relative">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center backdrop-blur transition-colors duration-300 group-hover:border-cyan-500/50">
                  <div className="absolute -top-4 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 font-bold text-white shadow-lg">
                    {s.n}
                  </div>
                  <div className={`mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br ${s.color} text-4xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
                    {s.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white">{s.title}</h3>
                  <p className="mt-2 leading-7 text-slate-400">{s.desc}</p>
                </div>
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