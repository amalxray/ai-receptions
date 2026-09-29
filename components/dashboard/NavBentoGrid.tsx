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

export default function NavBentoGrid({ group, stats, variant = 'panel', onNavigate }: NavBentoGridProps) {
  const tone = navTone(group.id);
  const columns = variant === 'drawer' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <motion.section
      key={group.id}
      aria-label={group.label}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden>{group.icon}</span>
          {group.label}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${tone.chip}`}>
            {group.items.length}
          </span>
        </p>
        <p className="text-[11px] text-slate-500">كل وحدات هذا القسم — لا شيء مخفي</p>
      </header>

      {group.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
          لا وحدات متاحة لصلاحيتك في هذا القسم.
        </p>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          className={`grid gap-3 ${columns}`}
        >
          {group.items.map((item) => (
            <BentoCard
              key={item.module}
              item={item}
              tone={tone}
              chip={stats ? statForModule(item.module, stats) : null}
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
  onNavigate,
}: {
  item: BentoItem;
  tone: ReturnType<typeof navTone>;
  chip: ReturnType<typeof statForModule>;
  onNavigate?: () => void;
}) {
  const presentation = navPresentation(item.module);
  const { spawn, layer } = usePressRipple();

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={`${SPAN_CLASS[presentation.span] ?? ''} ${item.locked ? 'opacity-70' : ''}`}
    >
      <Link
        href={item.href}
        onPointerDown={spawn}
        onClick={onNavigate}
        title={item.locked ? item.lockTitle : presentation.description}
        aria-current={item.active ? 'page' : undefined}
        className={`group relative flex h-full flex-col gap-2 overflow-hidden rounded-[1.5rem] border bg-gradient-to-br p-4 transition-colors ${tone.ring} ${tone.glow} ${
          item.active ? 'ring-2 ring-white/25' : ''
        }`}
      >
        {layer}
        <span aria-hidden className={`absolute inset-y-0 right-0 w-1 ${tone.bar}`} />

        <span className="flex items-start justify-between gap-2">
          <motion.span
            aria-hidden
            className="text-2xl leading-none"
            whileHover={{ scale: 1.12, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            {presentation.emoji}
          </motion.span>
          {item.locked ? (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${tone.chip}`}>🔒</span>
          ) : chip ? (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STAT_TONE_CLASS[chip.tone]}`}
            >
              {chip.text}
            </motion.span>
          ) : null}
        </span>

        <span className="mt-auto">
          <span className="block text-base font-semibold text-white">{item.label}</span>
          <span className="mt-1 block text-[11px] leading-5 text-slate-400">{presentation.description}</span>
        </span>

        {item.active ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-white/90">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.bar}`} aria-hidden />
            الوحدة الحالية
          </span>
        ) : null}
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
