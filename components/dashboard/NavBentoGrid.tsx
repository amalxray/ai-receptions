'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import type { NavGroupId } from '@/lib/services/dashboardNavModel';
import {
  STAT_TONE_CLASS,
  navPresentation,
  navTone,
  statForModule,
  type NavStats,
} from '@/lib/services/navBentoModel';

/**
 * N29 — the Bento grid of ONE nav group (one per tab).
 *
 * Purely presentational: gating (roles, permissions, plan locks), URLs and the
 * active route all arrive as props from the nav hook, so this file can be
 * server-rendered and unit tested without touching auth.
 *
 * Golden rule here: hover lift + glow, press ripple, staggered entrance, one
 * colour per section, and a 🔒 upsell card instead of hiding a locked module.
 */

export type BentoItem = {
  module: string;
  label: string;
  href: string;
  active: boolean;
  locked: boolean;
  /** Present when locked — "متاح في باقة …". */
  lockTitle?: string;
};

export type BentoGroup = {
  id: NavGroupId;
  label: string;
  icon: string;
  items: BentoItem[];
};

type NavBentoGridProps = {
  group: BentoGroup;
  stats?: NavStats;
  /** `panel` = the mega-menu under the sticky bar, `drawer` = the mobile drawer. */
  variant?: 'panel' | 'drawer';
  onNavigate?: () => void;
};

const SPAN_CLASS: Record<string, string> = {
  hero: 'sm:col-span-2 sm:row-span-2',
  wide: 'sm:col-span-2',
  unit: '',
};

const ITEM_TONES: Record<string, ReturnType<typeof navTone>> = {
  'my-payslips': {
    ring: 'border-amber-500/30 from-amber-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(245,158,11,0.75)]',
    bar: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-100 ring-amber-500/30',
    tab: 'from-amber-500/30 to-orange-500/10 ring-amber-400/40',
  },
  'knowledge-base': {
    ring: 'border-blue-500/30 from-blue-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(59,130,246,0.75)]',
    bar: 'bg-blue-400',
    chip: 'bg-blue-500/15 text-blue-100 ring-blue-500/30',
    tab: 'from-blue-500/30 to-cyan-500/10 ring-blue-400/40',
  },
  'public-page': {
    ring: 'border-cyan-500/30 from-cyan-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(34,211,238,0.75)]',
    bar: 'bg-cyan-400',
    chip: 'bg-cyan-500/15 text-cyan-100 ring-cyan-500/30',
    tab: 'from-cyan-500/30 to-sky-500/10 ring-cyan-400/40',
  },
  profile: {
    ring: 'border-violet-500/30 from-violet-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(167,139,250,0.75)]',
    bar: 'bg-violet-400',
    chip: 'bg-violet-500/15 text-violet-100 ring-violet-500/30',
    tab: 'from-violet-500/30 to-fuchsia-500/10 ring-violet-400/40',
  },
  'public-content': {
    ring: 'border-pink-500/30 from-pink-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(236,72,153,0.75)]',
    bar: 'bg-pink-400',
    chip: 'bg-pink-500/15 text-pink-100 ring-pink-500/30',
    tab: 'from-pink-500/30 to-rose-500/10 ring-pink-400/40',
  },
  ads: {
    ring: 'border-orange-500/30 from-orange-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(251,146,60,0.75)]',
    bar: 'bg-orange-400',
    chip: 'bg-orange-500/15 text-orange-100 ring-orange-500/30',
    tab: 'from-orange-500/30 to-amber-500/10 ring-orange-400/40',
  },
  'ai-settings': {
    ring: 'border-emerald-500/30 from-emerald-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(16,185,129,0.75)]',
    bar: 'bg-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/30',
    tab: 'from-emerald-500/30 to-teal-500/10 ring-emerald-400/40',
  },
  'communication-settings': {
    ring: 'border-indigo-500/30 from-indigo-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(99,102,241,0.75)]',
    bar: 'bg-indigo-400',
    chip: 'bg-indigo-500/15 text-indigo-100 ring-indigo-500/30',
    tab: 'from-indigo-500/30 to-violet-500/10 ring-indigo-400/40',
  },
  'clinic-setup': {
    ring: 'border-red-500/30 from-red-500/[0.14] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(239,68,68,0.75)]',
    bar: 'bg-red-400',
    chip: 'bg-red-500/15 text-red-100 ring-red-500/30',
    tab: 'from-red-500/30 to-rose-500/10 ring-red-400/40',
  },
};

export default function NavBentoGrid({ group, stats, variant = 'panel', onNavigate }: NavBentoGridProps) {
  const tone = navTone(group.id);
  const columns =
    variant === 'drawer'
      ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

  return (
    <motion.section
      key={group.id}
      aria-label={group.label}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative space-y-5 rounded-[2rem] border border-white/5 bg-slate-950/60 p-3 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.9)] backdrop-blur-xl sm:p-4"
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.15),_transparent_34%),linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:100%_100%,18px_18px,18px_18px] opacity-80" />

      <header className="relative flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-lg shadow-inner shadow-white/5">
            {group.icon}
          </span>
          {group.label}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${tone.chip}`}>
            {group.items.length}
          </span>
        </p>
        <p className="text-[11px] text-slate-400">كل وحدات هذا القسم — لا شيء مخفي</p>
      </header>

      {group.items.length === 0 ? (
        <p className="relative rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
          لا وحدات متاحة لصلاحيتك في هذا القسم.
        </p>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className={`relative grid gap-3 ${columns}`}
        >
          {group.items.map((item, index) => (
            <BentoCard
              key={item.module}
              item={item}
              tone={tone}
              chip={stats ? statForModule(item.module, stats) : null}
              index={index}
              onNavigate={onNavigate}
            />
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}

function BentoCard({
  item,
  tone,
  chip,
  index,
  onNavigate,
}: {
  item: BentoItem;
  tone: ReturnType<typeof navTone>;
  chip: ReturnType<typeof statForModule>;
  index: number;
  onNavigate?: () => void;
}) {
  const presentation = navPresentation(item.module);
  const { spawn, layer } = usePressRipple();
  const cardClass = `${SPAN_CLASS[presentation.span] ?? ''} ${item.locked ? 'opacity-80' : ''}`;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1 } }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cardClass}
    >
      <Link
        href={item.href}
        onPointerDown={spawn}
        onClick={onNavigate}
        title={item.locked ? item.lockTitle : presentation.description}
        aria-current={item.active ? 'page' : undefined}
        className={`group relative flex h-[80px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-500/50 hover:shadow-md dark:border-gray-700 dark:bg-slate-900 ${ITEM_TONES[item.module]?.ring ?? tone.ring} ${ITEM_TONES[item.module]?.glow ?? tone.glow} ${
          item.active ? 'ring-2 ring-teal-500/30 shadow-[0_0_30px_-18px_rgba(45,212,191,0.8)]' : 'ring-1 ring-slate-200/80 dark:ring-white/5'
        }`}
      >
        {layer}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/6 to-transparent" />
        <span aria-hidden className={`absolute inset-y-0 right-0 w-1 rounded-l-full ${ITEM_TONES[item.module]?.bar ?? tone.bar}`} />
        <span className="absolute left-4 top-4 z-10 text-[10px] font-black tracking-[0.2em] text-slate-400/80">
          {String(index + 1).padStart(2, '0')}
        </span>

        <span className="relative z-10 flex items-start justify-between gap-3">
          <motion.span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/8 text-lg shadow-inner shadow-white/5"
            whileHover={{ scale: 1.1, rotate: -7 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            {presentation.emoji}
          </motion.span>

          <div className="flex items-center gap-2">
            {item.locked ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${ITEM_TONES[item.module]?.chip ?? tone.chip}`}>🔒</span>
            ) : chip ? (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STAT_TONE_CLASS[chip.tone]}`}
              >
                {chip.text}
              </motion.span>
            ) : null}
          </div>
        </span>

        <span className="relative z-10 mt-1 flex flex-col gap-0.5">
          <span className="block text-[11px] font-bold leading-4 text-slate-900 dark:text-white">{item.label}</span>
        </span>

        <span className="relative z-10 mt-auto pt-1">
          {item.active ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-100">
              <span className={`h-2 w-2 rounded-full ${tone.bar}`} aria-hidden />
              الوحدة الحالية
            </span>
          ) : null}
        </span>
      </Link>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Press ripple (same interaction as the patients search surface)             */
/* -------------------------------------------------------------------------- */

type RippleDot = { id: number; x: number; y: number; size: number };

/**
 * Kept local on purpose (this delivery is capped at 8 files): the identical
 * interaction already exists in PatientSearchBar — a later cleanup can lift one
 * shared `components/ui/press-ripple.tsx` and delete both copies.
 */
function usePressRipple(): { spawn: (event: MouseEvent<HTMLElement>) => void; layer: ReactNode } {
  const [dots, setDots] = useState<RippleDot[]>([]);

  const spawn = (event: MouseEvent<HTMLElement>) => {
    const host = event.currentTarget;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    const id = Date.now() + Math.random();
    setDots((current) => [
      ...current,
      { id, x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size },
    ]);
    window.setTimeout(() => setDots((current) => current.filter((dot) => dot.id !== id)), 600);
  };

  const layer = (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <AnimatePresence>
        {dots.map((dot) => (
          <motion.span
            key={dot.id}
            initial={{ scale: 0, opacity: 0.28 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: dot.x,
              top: dot.y,
              width: dot.size,
              height: dot.size,
              borderRadius: '9999px',
              background: 'currentColor',
            }}
          />
        ))}
      </AnimatePresence>
    </span>
  );

  return { spawn, layer };
}
