'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';

/**
 * RESULTS SECTION — doctor-focused social proof (B2B, ROI numbers).
 * Replaces the old patient-facing "شغلنا بيحكي عنا" gallery tiles.
 */
type Result = {
  icon: string;
  /** Integer or decimal value to animate/display. */
  value: number;
  suffix: string;
  label: string;
  description: string;
  gradient: string;
};

const RESULTS: Result[] = [
  {
    icon: '📈',
    value: 40,
    suffix: '%+',
    label: 'زيادة الحجوزات',
    description: 'متوسط النمو في أول 3 أشهر',
    gradient: 'from-emerald-400 to-green-500',
  },
  {
    icon: '⏰',
    value: 60,
    suffix: '%-',
    label: 'توفير الوقت',
    description: 'وقت الرد على المرضى',
    gradient: 'from-cyan-400 to-blue-500',
  },
  {
    icon: '💬',
    value: 24,
    suffix: '/7',
    label: 'استجابة دائمة',
    description: 'بدون توقف أو إجازة',
    gradient: 'from-purple-400 to-pink-500',
  },
  {
    icon: '⭐',
    value: 4.9,
    suffix: '/5',
    label: 'رضا الأطباء',
    description: 'بناءً على 50+ تقييم',
    gradient: 'from-amber-400 to-orange-500',
  },
];

export default function ResultsSection() {
  return (
    <section className="bg-slate-950 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-300">
              📊 النتائج
            </span>
            <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">نتائج حقيقية لأطبائنا</h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-400">
              أرقام من عيادات حقيقية تستخدم AI-Receptions
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((item, idx) => (
            <BlurFade key={item.label} delay={idx * 0.1} inView className="h-full">
              <div className="group relative h-full rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-cyan-500/40">
                <div className="mb-4 text-4xl transition-transform duration-300 group-hover:scale-110">{item.icon}</div>
                <div
                  className={`mb-2 bg-gradient-to-br text-4xl font-bold ${item.gradient} bg-clip-text text-transparent`}
                  dir="ltr"
                >
                  {/* NumberTicker animates integers only — decimals render styled+static. */}
                  {Number.isInteger(item.value) ? <NumberTicker value={item.value} /> : item.value.toFixed(1)}
                  <span>{item.suffix}</span>
                </div>
                <div className="mb-1 text-lg font-bold text-white">{item.label}</div>
                <div className="text-sm text-slate-400">{item.description}</div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}