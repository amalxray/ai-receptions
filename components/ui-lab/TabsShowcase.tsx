'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Clock3, UsersRound } from 'lucide-react';

const tabs = [
  { id: 'today', label: 'اليوم', icon: CalendarDays, title: 'مواعيد اليوم', body: 'نظرة سريعة على جدول العيادة ومواعيد المراجعين.' },
  { id: 'upcoming', label: 'القادمة', icon: Clock3, title: 'المواعيد القادمة', body: 'تابع الحجوزات القادمة واستعد لكل زيارة بسهولة.' },
  { id: 'patients', label: 'المراجعين', icon: UsersRound, title: 'قائمة المراجعين', body: 'اعثر بسرعة على ملفات المراجعين ومعلومات التواصل.' },
];

export default function TabsShowcase() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-4 sm:p-5">
      <div role="tablist" aria-label="مثال التبويبات" className="relative flex w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-slate-900/70 p-1 sm:w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={selected} aria-controls="tab-panel" onClick={() => setActiveTab(tab.id)} className={`relative z-10 flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${selected ? 'text-white' : 'text-slate-500 hover:text-slate-200'}`}>
              {selected && <motion.span layoutId="ui-lab-tab-indicator" className="absolute inset-0 -z-10 rounded-lg border border-cyan-200/15 bg-gradient-to-l from-cyan-400/20 to-emerald-400/10 shadow-[0_4px_20px_-12px_rgba(34,211,238,0.5)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={active.id} role="tabpanel" id="tab-panel" aria-labelledby={`tab-${active.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }} className="mt-4 flex min-h-28 items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
          <div><h3 className="text-base font-extrabold text-white">{active.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{active.body}</p></div>
          <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.07] text-cyan-200 sm:grid"><active.icon size={18} /></span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
