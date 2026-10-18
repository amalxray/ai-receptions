'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { motion, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock, Star, type LucideIcon } from 'lucide-react';

/**
 * RESULTS SECTION — premium dark animated counters.
 */
type Result = {
  Icon: LucideIcon;
  /** Integer or decimal value to animate/display. */
  value: number;
  prefix?: string;
  suffix: string;
  label: string;
  description: string;
  gradient: string;
};

const RESULTS: Result[] = [
  {
    Icon: TrendingUp,
    value: 40,
    prefix: '+',
    suffix: '%',
    label: 'زيادة الحجوزات',
    description: 'متوسط النمو في أول 3 أشهر',
    gradient: 'from-[#10B981] to-emerald-300',
  },
  {
    Icon: TrendingDown,
    value: 70,
    prefix: '-',
    suffix: '%',
    label: 'مكالمات فائتة أقل',
    description: 'استجابة أسرع للمرضى في أي وقت',
    gradient: 'from-[#EF4444] to-rose-300',
  },
  {
    Icon: Clock,
    value: 60,
    suffix: '%',
    label: 'توفير وقت الاستقبال',
    description: 'وقت أكثر لرعاية المرضى وإدارة العيادة',
    gradient: 'from-[#F59E0B] to-amber-300',
  },
  {
    Icon: Star,
    value: 4.9,
    suffix: '/5',
    label: 'رضا الأطباء',
    description: 'بناءً على 50+ تقييم',
    gradient: 'from-amber-400 to-orange-500',
  },
];

export default function ResultsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0.3, once: true });
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isInView) return;
    const timers: ReturnType<typeof setInterval>[] = [];
    RESULTS.forEach((item) => {
      const key = item.label;
      const target = item.value;
      let current = 0;
      const step = target / 60; // animar en ~60 frames
      const timer = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        setCounts((prev) => ({ ...prev, [key]: current }));
      }, 16);
      timers.push(timer);
    });
    return () => timers.forEach((t) => clearInterval(t));
  }, [isInView]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-slate-950 py-24 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-[18%] top-[20%] h-72 w-72 rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[18%] h-72 w-72 rounded-full bg-violet-600/20 blur-[120px]" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm font-semibold text-cyan-300">
              النتائج
            </span>
            <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">نتائج حقيقية لأطبائنا</h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-400">
              أرقام من عيادات حقيقية تستخدم AI-Receptions
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((item, idx) => (
            <BlurFade key={item.label} delay={idx * 0.1} inView className="h-full">
              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                whileTap={{ scale: 0.99 }}
                className="group relative h-full rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-shadow duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]"
              >
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-300 transition-transform duration-300 group-hover:scale-110">
                  <item.Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div
                  className={`mb-2 bg-gradient-to-br text-6xl font-black ${item.gradient} bg-clip-text text-transparent`}
                  dir="ltr"
                >
                  {item.prefix}
                  {Number.isInteger(item.value)
                    ? counts[item.label]?.toFixed(0) ?? 0
                    : item.value.toFixed(1)}
                  <span>{item.suffix}</span>
                </div>
                <div className="mb-1 text-lg font-bold text-white">{item.label}</div>
                <div className="text-sm text-slate-400">{item.description}</div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.suffix === '/5' ? item.value * 20 : Math.abs(item.value)}><div style={{ width: `${item.suffix === '/5' ? item.value * 20 : Math.abs(item.value)}%` }} className={`h-full rounded-full bg-gradient-to-r ${item.gradient}`} /></div>
              </motion.div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}