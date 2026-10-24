'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { MessageCircle, Bot, CalendarCheck, type LucideIcon } from 'lucide-react';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';

type Step = {
  n: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
  color: string;
  glow: string;
};

const STEPS: Step[] = [
  { n: '1', Icon: MessageCircle, title: 'المريض يراسل', desc: 'عبر الموقع أو واتساب — بأي وقت وبلغته.', color: 'from-cyan-400 to-blue-500', glow: 'rgba(34,211,238,0.5)' },
  { n: '2', Icon: Bot, title: 'AI يفهم ويرد', desc: 'يفهم المشكلة، يسأل، ويقترح أقرب طبيب.', color: 'from-violet-400 to-purple-500', glow: 'rgba(139,92,246,0.5)' },
  { n: '3', Icon: CalendarCheck, title: 'الحجز يتم', desc: 'تأكيد فوري في جدولك — بدون تدخل يدوي.', color: 'from-emerald-400 to-green-500', glow: 'rgba(16,185,129,0.5)' },
];

export default function HowItWorksSection() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: timelineRef, offset: ['start 0.8', 'end 0.5'] });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[#0A0A0A] py-24 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <span className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm font-semibold text-cyan-300">
            كيف يعمل
          </span>
          <h2 className="text-3xl font-black text-white md:text-5xl">من الرسالة إلى الحجز</h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-400">ثلاث خطوات فقط — كل شيء تلقائي. أنت تتفرغ لمرضاك، والنظام لجميع الباقي.</p>
        </BlurFade>

        {/* Vertical glowing timeline — desktop: alternating, mobile: stacked */}
        <div ref={timelineRef} className="relative mx-auto mt-16 max-w-3xl">
          {/* Track */}
          <div aria-hidden="true" className="absolute right-6 top-0 h-full w-px bg-white/10 md:right-1/2" />
          {/* Progress glow driven by scroll */}
          <motion.div
            aria-hidden="true"
            style={{ scaleY: lineScaleY }}
            className="absolute right-6 top-0 h-full w-px origin-top bg-gradient-to-b from-cyan-400 via-violet-400 to-emerald-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] md:right-1/2"
          />

          <div className="space-y-10">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, delay: i * 0.05 }}
                className={`relative flex gap-6 pr-14 md:w-1/2 md:pr-0 ${i % 2 === 0 ? 'md:ml-auto md:flex-row md:pl-12' : 'md:mr-auto md:flex-row-reverse md:pr-12 md:text-left'}`}
              >
                {/* Node on the line */}
                <span
                  aria-hidden="true"
                  className={`absolute right-[19px] top-8 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${s.color} text-sm font-black text-white md:top-8 ${i % 2 === 0 ? 'md:-left-5 md:right-auto' : 'md:-right-5'}`}
                  style={{ boxShadow: `0 0 20px ${s.glow}` }}
                >
                  {s.n}
                </span>
                <motion.div
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="group relative w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl transition-shadow duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]"
                >
                  <div className={`mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br ${s.color} shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                    <s.Icon className="h-10 w-10 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{s.title}</h3>
                  <p className="mt-2 leading-7 text-slate-400">{s.desc}</p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>

        <BlurFade delay={0.4} inView>
          <div className="mt-16 flex justify-center">
            <Magnetic>
              <a href="mailto:support@ai-receptions.com?subject=%D8%A7%D8%B4%D8%AA%D8%B1%D8%A7%D9%83%20%D9%81%D9%8A%20AI-Receptions" target="_blank" rel="noopener noreferrer" aria-label="ابدأ الآن مجاناً">
                <ShimmerButton className="px-8 py-4 text-lg">ابدأ الآن مجاناً</ShimmerButton>
              </a>
            </Magnetic>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
