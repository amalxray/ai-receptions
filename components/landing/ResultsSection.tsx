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
  prefix?: string;
  suffix: string;
  label: string;
  description: string;
  gradient: string;
};

const RESULTS: Result[] = [
  {
    icon: '📈',
    value: 40,
    prefix: '+',
    suffix: '%',
    label: 'زيادة الحجوزات',
    description: 'متوسط النمو في أول 3 أشهر',
    gradient: 'from-[#10B981] to-emerald-300',
  },
  {
    icon: '📉',
    value: 70,
    prefix: '-',
    suffix: '%',
    label: 'مكالمات فائتة أقل',
    description: 'استجابة أسرع للمرضى في أي وقت',
    gradient: 'from-[#EF4444] to-rose-300',
  },
  {
    icon: '💰',
    value: 60,
    suffix: '%',
    label: 'توفير وقت الاستقبال',
    description: 'وقت أكثر لرعاية المرضى وإدارة العيادة',
    gradient: 'from-[#F59E0B] to-amber-300',
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
    <section className="bg-[#FAFBFC] py-24" style={{ backgroundImage: 'radial-gradient(circle at 18% 20%, rgba(59,130,246,0.12), transparent 35%), radial-gradient(circle at 82% 80%, rgba(139,92,246,0.12), transparent 35%)' }}>
      <div className="mx-auto max-w-6xl px-4">
        <BlurFade inView>
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-semibold text-blue-700">
              📊 النتائج
            </span>
            <h2 className="mb-4 text-4xl font-bold text-slate-950 md:text-5xl">نتائج حقيقية لأطبائنا</h2>
            <p className="mx-auto max-w-2xl text-lg text-slate-600">
              أرقام من عيادات حقيقية تستخدم AI-Receptions
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((item, idx) => (
            <BlurFade key={item.label} delay={idx * 0.1} inView className="h-full">
              <div className="group relative h-full rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_-18px_rgba(59,130,246,0.3)]">
                <div className="mb-4 text-4xl transition-transform duration-300 group-hover:scale-110">{item.icon}</div>
                <div
                  className={`mb-2 bg-gradient-to-br text-6xl font-black ${item.gradient} bg-clip-text text-transparent`}
                  dir="ltr"
                >
                  {/* NumberTicker animates integers only — decimals render styled+static. */}
                  {item.prefix}{Number.isInteger(item.value) ? <NumberTicker value={item.value} /> : item.value.toFixed(1)}
                  <span>{item.suffix}</span>
                </div>
                <div className="mb-1 text-lg font-bold text-slate-900">{item.label}</div>
                <div className="text-sm text-slate-600">{item.description}</div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.suffix === '/5' ? item.value * 20 : Math.abs(item.value)}><div style={{ width: `${item.suffix === '/5' ? item.value * 20 : Math.abs(item.value)}%` }} className={`h-full rounded-full bg-gradient-to-r ${item.gradient}`} /></div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}