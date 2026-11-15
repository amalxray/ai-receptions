'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { NavGroupId } from '@/lib/services/dashboardNavModel';
import {
  STAT_TONE_CLASS,
  navPresentation,
  navTone,
  statForModule,
  type NavStats,
} from '@/lib/services/navBentoModel';

export type BentoItem = {
  module: string;
  label: string;
  href: string;
  active: boolean;
  locked: boolean;
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
  onNavigate?: () => void;
};

type ButtonTone = {
  border: string;
  glow: string;
  accent: string;
  bar: string;
  chip: string;
};

const BUTTON_COLORS: Record<string, ButtonTone> = {
  cyan: {
    border: 'border-cyan-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(34,211,238,0.8)]',
    accent: 'text-cyan-200',
    bar: 'bg-cyan-400',
    chip: 'bg-cyan-500/15 text-cyan-100 ring-cyan-500/30',
  },
  sky: {
    border: 'border-sky-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(14,165,233,0.8)]',
    accent: 'text-sky-200',
    bar: 'bg-sky-400',
    chip: 'bg-sky-500/15 text-sky-100 ring-sky-500/30',
  },
  blue: {
    border: 'border-blue-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(59,130,246,0.8)]',
    accent: 'text-blue-200',
    bar: 'bg-blue-400',
    chip: 'bg-blue-500/15 text-blue-100 ring-blue-500/30',
  },
  green: {
    border: 'border-green-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(34,197,94,0.8)]',
    accent: 'text-green-200',
    bar: 'bg-green-400',
    chip: 'bg-green-500/15 text-green-100 ring-green-500/30',
  },
  emerald: {
    border: 'border-emerald-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(52,211,153,0.8)]',
    accent: 'text-emerald-200',
    bar: 'bg-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/30',
  },
  amber: {
    border: 'border-amber-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.85)]',
    accent: 'text-amber-200',
    bar: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-100 ring-amber-500/30',
  },
  orange: {
    border: 'border-orange-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.8)]',
    accent: 'text-orange-200',
    bar: 'bg-orange-400',
    chip: 'bg-orange-500/15 text-orange-100 ring-orange-500/30',
  },
  rose: {
    border: 'border-rose-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(251,113,133,0.8)]',
    accent: 'text-rose-200',
    bar: 'bg-rose-400',
    chip: 'bg-rose-500/15 text-rose-100 ring-rose-500/30',
  },
  pink: {
    border: 'border-pink-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(236,72,153,0.8)]',
    accent: 'text-pink-200',
    bar: 'bg-pink-400',
    chip: 'bg-pink-500/15 text-pink-100 ring-pink-500/30',
  },
  fuchsia: {
    border: 'border-fuchsia-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(217,70,239,0.8)]',
    accent: 'text-fuchsia-200',
    bar: 'bg-fuchsia-400',
    chip: 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-500/30',
  },
  violet: {
    border: 'border-violet-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(139,92,246,0.8)]',
    accent: 'text-violet-200',
    bar: 'bg-violet-400',
    chip: 'bg-violet-500/15 text-violet-100 ring-violet-500/30',
  },
  indigo: {
    border: 'border-indigo-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(99,102,241,0.8)]',
    accent: 'text-indigo-200',
    bar: 'bg-indigo-400',
    chip: 'bg-indigo-500/15 text-indigo-100 ring-indigo-500/30',
  },
  teal: {
    border: 'border-teal-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(20,184,166,0.8)]',
    accent: 'text-teal-200',
    bar: 'bg-teal-400',
    chip: 'bg-teal-500/15 text-teal-100 ring-teal-500/30',
  },
  lime: {
    border: 'border-lime-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(132,204,22,0.8)]',
    accent: 'text-lime-200',
    bar: 'bg-lime-400',
    chip: 'bg-lime-500/15 text-lime-100 ring-lime-500/30',
  },
  slate: {
    border: 'border-slate-400/50',
    glow: 'hover:shadow-[0_0_15px_rgba(148,163,184,0.7)]',
    accent: 'text-slate-200',
    bar: 'bg-slate-400',
    chip: 'bg-slate-500/15 text-slate-100 ring-slate-500/30',
  },
};

const BUTTON_TONES: Record<string, ButtonTone> = {
  overview: BUTTON_COLORS.cyan,
  appointments: BUTTON_COLORS.sky,
  patients: BUTTON_COLORS.blue,
  'medical-files': BUTTON_COLORS.green,
  referrals: BUTTON_COLORS.rose,
  providers: BUTTON_COLORS.indigo,
  services: BUTTON_COLORS.fuchsia,
  team: BUTTON_COLORS.violet,
  conversations: BUTTON_COLORS.violet,
  reviews: BUTTON_COLORS.amber,
  messages: BUTTON_COLORS.fuchsia,
  notifications: BUTTON_COLORS.orange,
  leads: BUTTON_COLORS.lime,
  'financial-intelligence': BUTTON_COLORS.amber,
  expenses: BUTTON_COLORS.orange,
  revenues: BUTTON_COLORS.emerald,
  payroll: BUTTON_COLORS.emerald,
  'my-payslips': BUTTON_COLORS.amber,
  analytics: BUTTON_COLORS.violet,
  growth: BUTTON_COLORS.pink,
  subscription: BUTTON_COLORS.amber,
  'knowledge-base': BUTTON_COLORS.blue,
  'public-page': BUTTON_COLORS.cyan,
  'public-content': BUTTON_COLORS.pink,
  'before-after': BUTTON_COLORS.rose,
  badges: BUTTON_COLORS.amber,
  profile: BUTTON_COLORS.violet,
  'ai-settings': BUTTON_COLORS.emerald,
  'communication-settings': BUTTON_COLORS.indigo,
  ads: BUTTON_COLORS.orange,
  imaging: BUTTON_COLORS.sky,
  lab: BUTTON_COLORS.green,
  'imaging-centers': BUTTON_COLORS.teal,
  'imaging-requests': BUTTON_COLORS.teal,
  'referring-clinics': BUTTON_COLORS.cyan,
  'clinic-setup': BUTTON_COLORS.rose,
  setup: BUTTON_COLORS.slate,
  'ai-analysis': BUTTON_COLORS.violet,
};

function readStoredOrder(groupId: NavGroupId, fallback: string[]) {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(`nav-grid-order-${groupId}`);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;

    const valid = parsed.filter((module): module is string => typeof module === 'string' && fallback.includes(module));
    const missing = fallback.filter((module) => !valid.includes(module));
    return [...valid, ...missing];
  } catch {
    return fallback;
  }
}

export default function NavBentoGrid({ group, stats, onNavigate }: NavBentoGridProps) {
  const defaultOrder = useMemo(() => group.items.map((item) => item.module), [group.items]);
  const [orderedModules, setOrderedModules] = useState<string[]>(() => readStoredOrder(group.id, defaultOrder));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setOrderedModules((current) => {
      const valid = current.filter((module) => defaultOrder.includes(module));
      const missing = defaultOrder.filter((module) => !valid.includes(module));
      return [...valid, ...missing];
    });
  }, [defaultOrder]);

  useEffect(() => {
    window.localStorage.setItem(`nav-grid-order-${group.id}`, JSON.stringify(orderedModules));
  }, [group.id, orderedModules]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    setOrderedModules((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      return oldIndex < 0 || newIndex < 0 ? current : arrayMove(current, oldIndex, newIndex);
    });
  };

  const orderedItems = orderedModules
    .map((module) => group.items.find((item) => item.module === module))
    .filter((item): item is BentoItem => Boolean(item));
  const groupTone = navTone(group.id);

  return (
    <section aria-label={group.label} className="relative space-y-4 rounded-2xl border border-white/10 bg-slate-950/70 p-3 shadow-xl backdrop-blur-xl">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-base">
            {group.icon}
          </span>
          {group.label}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${groupTone.chip}`}>
            {group.items.length}
          </span>
        </p>
        <p className="text-xs text-slate-400">اسحب الأزرار لترتيبها</p>
      </header>

      {orderedItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 p-3 text-center text-sm text-slate-400">لا وحدات متاحة في هذا القسم.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedModules} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4 lg:grid-cols-6">
              {orderedItems.map((item, index) => (
                <SortableButton
                  key={item.module}
                  item={item}
                  index={index}
                  stats={stats}
                  fallbackTone={groupTone}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function SortableButton({
  item,
  index,
  stats,
  fallbackTone,
  onNavigate,
}: {
  item: BentoItem;
  index: number;
  stats?: NavStats;
  fallbackTone: ReturnType<typeof navTone>;
  onNavigate?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.module });
  const presentation = navPresentation(item.module);
  const tone = BUTTON_TONES[item.module] ?? {
    border: 'border-white/20',
    glow: fallbackTone.glow,
    accent: 'text-white',
    bar: fallbackTone.bar,
    chip: fallbackTone.chip,
  };
  const chip = stats ? statForModule(item.module, stats) : null;

  return (
    <motion.div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative min-w-0 ${isDragging ? 'z-20 opacity-70' : ''}`}
    >
      <Link
        href={item.href}
        onClick={onNavigate}
        title={item.locked ? item.lockTitle : presentation.description}
        aria-current={item.active ? 'page' : undefined}
        className={`group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border bg-slate-900/90 p-2 pb-7 text-sm shadow-sm transition-all duration-300 hover:-translate-y-0.5 ${tone.border} ${tone.glow} ${
          item.active ? 'ring-2 ring-white/40' : 'ring-1 ring-white/5'
        }`}
      >
        <span aria-hidden className={`absolute inset-y-2 right-0 w-1 rounded-l-full ${tone.bar}`} />
        <span className="flex min-w-0 items-center gap-2 pr-1">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-base ${tone.accent}`} aria-hidden>
            {presentation.emoji}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold leading-5 text-white">{item.label}</span>
          {item.locked ? (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${tone.chip}`}>🔒</span>
          ) : chip ? (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STAT_TONE_CLASS[chip.tone]}`}>
              {chip.text}
            </span>
          ) : null}
        </span>
        {item.active ? <span className="text-xs font-medium text-emerald-200">الوحدة الحالية</span> : null}
      </Link>

      <button
        type="button"
        aria-label={`إعادة ترتيب ${item.label}`}
        className="absolute bottom-1 right-1 z-20 flex h-4 w-4 cursor-grab items-center justify-center rounded border border-white/30 bg-slate-950/90 text-[8px] leading-none text-slate-300 shadow-sm active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="pointer-events-none absolute bottom-1 left-2 text-[10px] font-bold text-slate-500/80">
        {String(index + 1).padStart(2, '0')}
      </span>
    </motion.div>
  );
}
