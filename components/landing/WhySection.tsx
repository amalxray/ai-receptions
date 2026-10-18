'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, CalendarCheck, ScanFace, BarChart3, ShieldCheck, Zap, type LucideIcon } from 'lucide-react';
import { useLandingCopy } from '@/components/landing/LandingContent';
import FeatureModal from '@/components/landing/FeatureModal';

const CARD_ICONS: LucideIcon[] = [Bot, ScanFace, BarChart3, Zap, CalendarCheck, ShieldCheck];

const CARD_GLOWS = [
  'hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]',
  'hover:border-violet-400/40 hover:shadow-[0_0_30px_rgba(139,92,246,0.25)]',
  'hover:border-emerald-400/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.22)]',
  'hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]',
  'hover:border-violet-400/40 hover:shadow-[0_0_30px_rgba(139,92,246,0.25)]',
  'hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]',
];

const CARD_ICON_STYLES = [
  'bg-cyan-500/15 text-cyan-300',
  'bg-violet-500/15 text-violet-300',
  'bg-emerald-500/15 text-emerald-300',
  'bg-cyan-500/15 text-cyan-300',
  'bg-violet-500/15 text-violet-300',
  'bg-cyan-500/15 text-cyan-300',
];

/** Bento spans — hero card (AI) spans 2x2, the rest fill the 3-col grid. */
const CARD_SPANS = [
  'md:col-span-2 md:row-span-2',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-1',
  'md:col-span-1',
];

const gridVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const cardVariants = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

/** لماذا AI-Receptions — premium dark Bento grid. */
export default function WhySection() {
  const copy = useLandingCopy();
  const features = copy.features;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeFeature = activeIndex !== null ? features.cards[activeIndex] : null;
  const ActiveIcon: LucideIcon = CARD_ICONS[(activeIndex ?? 0) % CARD_ICONS.length];
  return (
    <section id="features" className="relative overflow-hidden bg-[#0A0A0A] py-24 text-white">
      {/* Radial gradient ambience — cyan / violet at low opacity */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/10 blur-[100px]" />
        <motion.div animate={{ x: [0, 24, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="absolute left-1/4 top-10 h-64 w-64 rounded-full bg-cyan-500/10 blur-[100px]" />
        <motion.div animate={{ x: [0, -24, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-10 right-1/4 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <p className="mb-3 text-center text-sm font-bold uppercase tracking-[0.3em] text-cyan-300">{features.eyebrow}</p>
          <h2 className="text-center text-3xl font-black text-white md:text-5xl">
            {features.title}{' '}
            <span className="bg-gradient-to-l from-violet-400 to-cyan-300 bg-clip-text text-transparent">
              {features.titleAccent}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-400">
            {features.subtitle}
          </p>
        </BlurFade>

        <motion.div
          variants={gridVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2"
        >
          {features.cards.map((feature: { icon: string; title: string; desc: string; href: string; cta?: string }, index: number) => {
            const Icon = CARD_ICONS[index % CARD_ICONS.length];
            const isHero = index === 0;
            return (
              <motion.article
                key={`${feature.title}-${index}`}
                variants={cardVariants}
                whileHover={{ y: -5, scale: 1.02 }}
                whileTap={{ scale: 0.99 }}
                className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 text-start backdrop-blur-xl transition-shadow duration-300 ${CARD_GLOWS[index % CARD_GLOWS.length]} ${CARD_SPANS[index % CARD_SPANS.length]}`}
              >
                <span className="relative z-10 flex h-full flex-col">
                  <div className={`grid h-14 w-14 place-items-center rounded-2xl ${CARD_ICON_STYLES[index % CARD_ICON_STYLES.length]}`}>
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h3 className={`mt-5 font-bold text-white ${isHero ? 'text-2xl md:text-3xl' : 'text-lg'}`}>{feature.title}</h3>
                  <p className={`mt-2 leading-6 text-slate-400 ${isHero ? 'text-base md:text-lg' : 'text-sm'}`}>{feature.desc}</p>
                  {feature.cta && (
                    <button
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className="mt-4 inline-flex w-fit text-sm font-semibold text-cyan-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    >
                      {feature.cta} ←
                    </button>
                  )}
                </span>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </motion.article>
            );
          })}
        </motion.div>

        {activeFeature && (
          <FeatureModal
            open={activeIndex !== null}
            onClose={() => setActiveIndex(null)}
            title={activeFeature.title}
            desc={activeFeature.desc}
            Icon={ActiveIcon}
            iconClassName={CARD_ICON_STYLES[(activeIndex ?? 0) % CARD_ICON_STYLES.length]}
            detailIndex={activeIndex ?? 0}
          />
        )}
      </div>
    </section>
  );
}