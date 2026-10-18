'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Heart, Moon, Sparkles } from 'lucide-react';

const palettes = [
  { id: 'ocean', name: 'نسيم البحر', colors: ['#67e8f9', '#6ee7b7', '#c4b5fd'], glow: 'rgba(103,232,249,0.22)', surface: 'from-cyan-400/15 via-teal-400/10 to-violet-400/15' },
  { id: 'lavender', name: 'لافندر هادئ', colors: ['#c4b5fd', '#a5b4fc', '#f0abfc'], glow: 'rgba(196,181,253,0.22)', surface: 'from-violet-400/20 via-indigo-400/10 to-fuchsia-400/15' },
  { id: 'sage', name: 'أخضر الميرمية', colors: ['#a7f3d0', '#bef264', '#99f6e4'], glow: 'rgba(167,243,208,0.2)', surface: 'from-emerald-300/20 via-lime-300/10 to-teal-300/15' },
  { id: 'dawn', name: 'شروق ناعم', colors: ['#fda4af', '#fdba74', '#f0abfc'], glow: 'rgba(253,164,175,0.2)', surface: 'from-rose-300/20 via-orange-300/10 to-fuchsia-300/15' },
];

const motes = [
  { id: 'mote-1', className: 'left-[12%] top-[28%] h-2 w-2', x: [0, 24, -10, 0], y: [0, -24, 12, 0], delay: 0, color: 'bg-cyan-200' },
  { id: 'mote-2', className: 'left-[30%] top-[72%] h-1.5 w-1.5', x: [0, -18, 15, 0], y: [0, 16, -20, 0], delay: 1.2, color: 'bg-emerald-200' },
  { id: 'mote-3', className: 'left-[54%] top-[18%] h-1.5 w-1.5', x: [0, 16, -12, 0], y: [0, 18, 28, 0], delay: 0.7, color: 'bg-violet-200' },
  { id: 'mote-4', className: 'left-[76%] top-[64%] h-2 w-2', x: [0, -22, 10, 0], y: [0, -15, 20, 0], delay: 1.8, color: 'bg-teal-100' },
  { id: 'mote-5', className: 'left-[88%] top-[31%] h-1 w-1', x: [0, 12, -18, 0], y: [0, 20, -12, 0], delay: 0.4, color: 'bg-fuchsia-200' },
  { id: 'mote-6', className: 'left-[43%] top-[48%] h-1 w-1', x: [0, -14, 18, 0], y: [0, 12, -18, 0], delay: 2.1, color: 'bg-sky-100' },
];

export default function AmbientShowcase() {
  const [paletteId, setPaletteId] = useState(palettes[0].id);
  const [calmMode, setCalmMode] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const palette = palettes.find((item) => item.id === paletteId) ?? palettes[0];
  const animate = !shouldReduceMotion && !calmMode;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="relative min-h-[280px] overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/70 p-5 sm:p-7">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />
          <motion.div aria-hidden="true" className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-[80px]" animate={animate ? { x: [0, 46, -24, 0], y: [0, 18, 42, 0], scale: [1, 1.15, 0.94, 1] } : undefined} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.div aria-hidden="true" className="absolute -bottom-28 right-[20%] h-72 w-72 rounded-full bg-emerald-300/15 blur-[90px]" animate={animate ? { x: [0, -32, 22, 0], y: [0, -28, -6, 0], scale: [1, 0.92, 1.12, 1] } : undefined} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 1 }} />
          <motion.div aria-hidden="true" className="absolute -right-16 top-0 h-60 w-60 rounded-full bg-violet-400/15 blur-[85px]" animate={animate ? { x: [0, -24, 30, 0], y: [0, 30, -18, 0] } : undefined} transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }} />
          {motes.map((mote) => (
            <motion.span key={mote.id} aria-hidden="true" className={`absolute z-[1] rounded-full ${mote.className} ${mote.color} shadow-[0_0_16px_rgba(255,255,255,0.45)]`} animate={animate ? { x: mote.x, y: mote.y, opacity: [0.3, 0.9, 0.45], scale: [0.85, 1.2, 0.85] } : { opacity: 0.5 }} transition={{ duration: 10 + mote.delay, repeat: Infinity, ease: 'easeInOut', delay: mote.delay }} />
          ))}
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.7 }} className="relative z-10 flex min-h-[232px] flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-[10px] font-semibold text-slate-300 backdrop-blur-xl"><Sparkles size={12} className="text-cyan-200" /> AURORA · 22 SEC LOOP</span><h3 className="mt-5 text-2xl font-black text-white">مساحة تتنفّس بهدوء</h3><p className="mt-2 max-w-sm text-xs leading-6 text-slate-300/70">تدرجات ضوئية بطيئة، ونقاط ناعمة تتحرك كأنها نسيم.</p></div>
              <button type="button" onClick={() => setCalmMode((value) => !value)} aria-pressed={calmMode} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 py-2 text-[10px] font-semibold text-slate-200 backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900/60"><Moon size={13} /> {calmMode ? 'الحركة متوقفة' : 'أوقف الحركة'}</button>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex gap-2">{palette.colors.map((color) => <span key={color} className="h-5 w-5 rounded-full border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.08)]" style={{ backgroundColor: color }} />)}</div>
              <span className="text-[10px] text-slate-300/60">{shouldReduceMotion ? 'وضع تقليل الحركة مفعّل' : calmMode ? 'نسخة ساكنة' : 'حركة بطيئة ومريحة'}</span>
            </div>
          </motion.div>
        </div>

        <motion.article animate={animate ? { y: [0, -7, 0], boxShadow: ['0 16px 50px -30px rgba(34,211,238,0.25)', '0 20px 65px -28px rgba(52,211,153,0.34)', '0 16px 50px -30px rgba(34,211,238,0.25)'] } : { y: 0 }} transition={{ duration: 7, repeat: animate ? Infinity : 0, ease: 'easeInOut' }} className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${palette.surface} opacity-80`} />
          <div className="relative flex items-center justify-between"><span className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-1.5 text-[10px] text-slate-300 backdrop-blur">SOFT GLASS</span><Heart size={17} className="text-rose-200/80" /></div>
          <div className="relative rounded-2xl border border-white/15 bg-slate-950/35 p-5 backdrop-blur-2xl">
            <p className="text-xs text-slate-400">تذكير لطيف</p><h3 className="mt-2 text-lg font-extrabold text-white">خذ وقتك، نحن هنا.</h3><p className="mt-2 text-xs leading-5 text-slate-400">بطاقة زجاجية عائمة بهالة خفيفة بدل الوميض السريع.</p>
          </div>
          <span className="relative text-[10px] text-slate-500">حركة تنفّس · 7 ثوانٍ</span>
        </motion.article>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-5">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-white">لوحة الألوان</h3><p className="mt-1 text-xs text-slate-500">اختر جوًّا لتغيير البطاقة</p></div><Sparkles size={16} className="text-violet-200" /></div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {palettes.map((option) => {
              const selected = option.id === paletteId;
              return <button key={option.id} type="button" onClick={() => setPaletteId(option.id)} aria-pressed={selected} className={`flex items-center justify-between rounded-xl border p-3 text-right text-xs transition ${selected ? 'border-cyan-200/30 bg-white/[0.07] text-white' : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200'}`}><span>{option.name}</span><span className="flex items-center gap-1">{option.colors.map((color) => <i key={color} className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />)}{selected && <Check size={12} className="mr-1 text-emerald-200" />}</span></button>;
            })}
          </div>
          <button type="button" onClick={() => setCalmMode((value) => !value)} aria-pressed={calmMode} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-slate-300 transition hover:bg-white/[0.05]"><span>تقليل الحركة</span><span className={`h-2 w-2 rounded-full ${calmMode || shouldReduceMotion ? 'bg-emerald-200' : 'bg-slate-600'}`} /></button>
        </div>

        <motion.div animate={animate ? { borderColor: ['rgba(103,232,249,0.15)', 'rgba(167,243,208,0.5)', 'rgba(196,181,253,0.38)', 'rgba(103,232,249,0.15)'], boxShadow: ['0 0 18px rgba(103,232,249,0.03)', '0 0 32px rgba(167,243,208,0.12)', '0 0 28px rgba(196,181,253,0.1)', '0 0 18px rgba(103,232,249,0.03)'] } : undefined} transition={{ duration: 9, repeat: animate ? Infinity : 0, ease: 'easeInOut' }} className="relative flex min-h-[190px] flex-col justify-center overflow-hidden rounded-2xl border border-cyan-200/15 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6">
          <div className="absolute -left-12 -top-16 h-40 w-40 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative"><span className="text-[10px] font-mono tracking-[0.18em] text-emerald-200/70">BREATHING BORDER · 9 SEC</span><h3 className="mt-3 text-lg font-extrabold text-white">وهج يهدأ ويعود</h3><p className="mt-2 max-w-lg text-xs leading-6 text-slate-400">إطار مضيء يتدرّج بين السماوي والنعناعي واللافندر. الحركة تتوقف تلقائيًا عند تفعيل تقليل الحركة.</p></div>
        </motion.div>
      </div>

      <p className="px-1 text-[10px] leading-5 text-slate-600">الحركة تحترم إعداد تقليل الحركة في جهازك، ويمكن إيقافها من المثال أعلاه.</p>
    </div>
  );
}
