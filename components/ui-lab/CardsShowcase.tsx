'use client';

import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { Activity, ArrowUpLeft, CalendarDays, HeartPulse, ShieldCheck, Sparkles } from 'lucide-react';

export default function CardsShowcase() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BentoCard />
      <GlassCard />
      <TiltCard />
      <SpotlightCard />
    </div>
  );
}

function BentoCard() {
  return (
    <div className="grid min-h-[260px] grid-cols-2 grid-rows-2 gap-3 rounded-2xl border border-white/[0.06] bg-slate-950/55 p-3">
      <div className="row-span-2 flex flex-col justify-between overflow-hidden rounded-xl border border-cyan-300/10 bg-gradient-to-br from-cyan-400/[0.13] via-slate-900 to-slate-950 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/10 text-cyan-200"><HeartPulse size={20} /></div>
        <div><p className="text-xs text-slate-500">لوحة العيادة</p><h3 className="mt-1 text-lg font-extrabold text-white">رعاية متصلة</h3><p className="mt-2 text-xs leading-5 text-slate-400">كل تفاصيل يومك في مساحة واحدة.</p></div>
      </div>
      <div className="flex flex-col justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"><Activity size={17} className="text-emerald-300" /><div><p className="text-2xl font-black text-white">+28%</p><p className="text-[11px] text-slate-500">نمو الحجوزات</p></div></div>
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"><div><p className="text-sm font-bold text-slate-200">المواعيد</p><p className="mt-1 text-[11px] text-slate-500">جدول اليوم جاهز</p></div><CalendarDays size={17} className="text-cyan-300" /></div>
    </div>
  );
}

function GlassCard() {
  return (
    <div className="relative flex min-h-[260px] items-end overflow-hidden rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.19),transparent_38%),radial-gradient(circle_at_85%_85%,rgba(52,211,153,0.14),transparent_38%),rgba(15,23,42,0.38)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl">
      <div className="absolute right-6 top-6 h-24 w-24 rounded-full border border-cyan-200/20 bg-cyan-200/10 blur-[1px]" />
      <div className="absolute right-12 top-12 h-12 w-12 rounded-full bg-emerald-300/20 blur-xl" />
      <div className="relative w-full rounded-xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-300">ملخص الزيارة</span><ShieldCheck size={16} className="text-emerald-300" /></div>
        <p className="mt-4 text-lg font-extrabold text-white">ابتسامتك، أولويتنا</p>
        <p className="mt-1 text-xs text-slate-400">تصميم زجاجي بطبقات واضحة وإضاءة ناعمة.</p>
      </div>
    </div>
  );
}

function TiltCard() {
  const rotateX = useSpring(0, { stiffness: 180, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 18 });

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    rotateY.set((x - 0.5) * 12);
    rotateX.set((0.5 - y) * 12);
  }

  function resetTilt() { rotateX.set(0); rotateY.set(0); }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-950/55 p-3 [perspective:900px]">
      <motion.article onMouseMove={handleMove} onMouseLeave={resetTilt} style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }} className="flex min-h-[236px] flex-col justify-between rounded-xl border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.12] via-slate-900 to-slate-950 p-5 transition-colors hover:border-violet-200/30">
        <div className="flex items-center justify-between"><span className="rounded-full border border-violet-200/15 bg-violet-200/10 px-3 py-1 text-[10px] font-semibold text-violet-200">تجربة تفاعلية</span><Sparkles size={17} className="text-violet-200" /></div>
        <div style={{ transform: 'translateZ(28px)' }}><p className="text-xs text-slate-500">حرّك المؤشر</p><h3 className="mt-2 text-xl font-black text-white">عمق يتحرك معك</h3><p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">ميلان ثلاثي الأبعاد ناعم باستخدام Framer Motion.</p></div>
      </motion.article>
    </div>
  );
}

function SpotlightCard() {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const background = useMotionTemplate`radial-gradient(280px circle at ${x}px ${y}px, rgba(34, 211, 238, 0.17), transparent 75%)`;

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - rect.left);
    y.set(event.clientY - rect.top);
  }

  return (
    <motion.article onMouseMove={handleMove} style={{ background }} className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/55 p-5">
      <div className="absolute inset-0 -z-10 bg-slate-950/90" />
      <div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.07] text-cyan-200"><Sparkles size={18} /></div><span className="font-mono text-[10px] text-slate-600">SPOTLIGHT / 01</span></div>
      <div><p className="text-xs text-slate-500">تأثير يتبع المؤشر</p><h3 className="mt-2 text-xl font-extrabold text-white">ضوء يكشف التفاصيل</h3><p className="mt-2 text-xs leading-5 text-slate-400">حرّك الماوس فوق البطاقة لتجربة إضاءة Spotlight.</p></div>
      <ArrowUpLeft size={17} className="absolute bottom-5 left-5 text-slate-600 transition group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:text-cyan-200" />
    </motion.article>
  );
}
