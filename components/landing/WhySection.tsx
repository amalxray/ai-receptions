'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLandingCopy } from '@/components/landing/LandingContent';

const CARD_STYLES = [
  { iconClass: 'bg-violet-50 text-violet-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(139,92,246,0.5)]', ripple: 'border-violet-300/60', wash: 'from-violet-500/10' },
  { iconClass: 'bg-blue-50 text-blue-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(59,130,246,0.5)]', ripple: 'border-blue-300/60', wash: 'from-blue-500/10' },
  { iconClass: 'bg-cyan-50 text-cyan-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(6,182,212,0.5)]', ripple: 'border-cyan-300/60', wash: 'from-cyan-500/10' },
  { iconClass: 'bg-emerald-50 text-emerald-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(16,185,129,0.5)]', ripple: 'border-emerald-300/40', wash: 'from-emerald-500/10' },
  { iconClass: 'bg-amber-50 text-amber-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(245,158,11,0.5)]', ripple: 'border-amber-300/60', wash: 'from-amber-500/10' },
  { iconClass: 'bg-rose-50 text-rose-700', glow: 'hover:shadow-[0_16px_40px_-20px_rgba(244,63,94,0.45)]', ripple: 'border-rose-300/60', wash: 'from-rose-500/10' },
];

const gridVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const cardVariants = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } };

/** لماذا AI-Receptions — six feature cards on a light, animated canvas. */
export default function WhySection() {
  const copy = useLandingCopy();
  const features = copy.features;
  return (
    <section className="relative overflow-hidden bg-[#FAFBFC] py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div animate={{ x: [0, 24, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-violet-200/50 blur-[100px]" />
        <motion.div animate={{ x: [0, -24, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-cyan-200/50 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <p className="mb-3 text-center text-sm font-bold uppercase tracking-[0.3em] text-violet-700">{features.eyebrow}</p>
          <h2 className="text-center text-3xl font-black text-slate-950 md:text-5xl">
            {features.title}{' '}
            <span className="bg-gradient-to-l from-violet-600 to-cyan-500 bg-clip-text text-transparent">
              {features.titleAccent}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">
            {features.subtitle}
          </p>
        </BlurFade>

        <motion.div variants={gridVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.cards.map((feature: { icon: string; title: string; desc: string; href: string; cta?: string }, index: number) => {
            const style = CARD_STYLES[index % CARD_STYLES.length];
            return <motion.article key={`${feature.title}-${index}`} variants={cardVariants} whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }} className={`group relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-shadow duration-300 ${style.glow}`}>
              <Link href={feature.href} className="relative z-10 block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                <span aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-2 opacity-0 transition duration-700 group-hover:scale-[1.7] group-hover:opacity-100 ${style.ripple}`} />
                <div className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl ${style.iconClass}`}>{feature.icon}</div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.desc}</p>
                {feature.cta && <span className="mt-4 inline-flex text-sm font-semibold text-violet-700">{feature.cta} ←</span>}
              </Link>
              <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-br ${style.wash} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
            </motion.article>;
          })}
        </motion.div>
      </div>
    </section>
  );
}