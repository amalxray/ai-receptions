'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Moon, Sparkles } from 'lucide-react';

export default function TogglesShowcase() {
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex min-h-32 items-center justify-between rounded-2xl border border-white/[0.06] bg-slate-950/55 p-5">
        <div className="flex items-center gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.07] text-cyan-200"><Bell size={19} /></span><div><p className="text-sm font-bold text-white">تنبيهات المواعيد</p><p className="mt-1 text-xs text-slate-500">إشعار قبل الموعد بساعة</p></div></div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="تبديل تنبيهات المواعيد" onClick={() => setEnabled((value) => !value)} className={`relative h-8 w-[3.6rem] rounded-full border p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/40 ${enabled ? 'border-emerald-300/40 bg-emerald-400/20' : 'border-slate-600 bg-slate-800'}`}>
          <motion.span layout className={`block h-6 w-6 rounded-full shadow-lg ${enabled ? 'bg-gradient-to-br from-cyan-200 to-emerald-200 shadow-emerald-300/30' : 'bg-slate-400'}`} transition={{ type: 'spring', stiffness: 520, damping: 32 }} />
        </button>
      </div>
      <div className="flex min-h-32 items-center justify-between rounded-2xl border border-white/[0.06] bg-slate-950/55 p-5">
        <div className="flex items-center gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl border border-violet-300/10 bg-violet-300/[0.07] text-violet-200"><Moon size={18} /></span><div><p className="text-sm font-bold text-white">الوضع الهادئ</p><p className="mt-1 text-xs text-slate-500">أوقف التنبيهات مؤقتًا</p></div></div>
        <button type="button" role="switch" aria-checked={!enabled} aria-label="تبديل الوضع الهادئ" onClick={() => setEnabled((value) => !value)} className={`relative h-8 w-[3.6rem] rounded-full border p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-violet-300/40 ${!enabled ? 'border-violet-300/40 bg-violet-400/20' : 'border-slate-600 bg-slate-800'}`}>
          <motion.span layout className={`block h-6 w-6 rounded-full shadow-lg ${!enabled ? 'bg-gradient-to-br from-violet-200 to-fuchsia-200 shadow-violet-300/30' : 'bg-slate-400'}`} transition={{ type: 'spring', stiffness: 520, damping: 32 }} />
        </button>
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={enabled ? 'on' : 'off'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-center gap-2 text-xs text-slate-500 md:col-span-2">
          <Sparkles size={13} className={enabled ? 'text-emerald-300' : 'text-slate-600'} />
          الحالة الحالية للعرض: <span className={enabled ? 'text-emerald-200' : 'text-slate-300'}>{enabled ? 'التنبيهات مفعّلة' : 'الوضع الهادئ مفعّل'}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
