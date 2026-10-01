'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BlurFade } from '@/components/ui/blur-fade';
import { Magnetic } from '@/components/ui/magnetic';
import { Ripple } from '@/components/ui/ripple';

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-[#FAFBFC] py-28">
      <motion.div aria-hidden="true" animate={{ x: [0, 22, 0], y: [0, -16, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-violet-300/40 blur-[110px]" />
      <motion.div aria-hidden="true" animate={{ x: [0, -22, 0], y: [0, 16, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-cyan-300/40 blur-[110px]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
        <Ripple number={6} color="rgba(139,92,246,0.3)" />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
        <BlurFade inView>
          <h2 className="text-4xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-6xl">✨ جاهز توقف النزيف؟</h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="mx-auto mt-5 max-w-2xl text-2xl font-bold text-slate-800">ابدأ مجاناً اليوم.</p>
          <p className="mx-auto mt-2 max-w-2xl text-lg text-slate-600">لا بطاقة. لا التزام. لا مخاطرة.</p>
        </BlurFade>
        <BlurFade delay={0.4} inView>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Link href="/register" className="inline-flex animate-pulse items-center justify-center rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] px-10 py-5 text-lg font-bold text-white shadow-[0_0_28px_rgba(139,92,246,0.35)] transition hover:shadow-[0_0_42px_rgba(34,211,238,0.55)]">
                ابدأ الآن ←
              </Link>
            </Magnetic>
            <a href="mailto:support@ai-receptions.com" className="inline-flex items-center justify-center rounded-full border border-violet-300 bg-white/70 px-10 py-5 text-lg font-bold text-violet-800 transition hover:border-violet-500 hover:bg-violet-50">تحدث معنا</a>
          </div>
        </BlurFade>
        <BlurFade delay={0.6} inView>
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
            {['إلغاء في أي وقت', '5 دقائق', 'دعم كامل'].map((item) => <span key={item}><span className="mr-1 text-emerald-600">✓</span>{item}</span>)}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
