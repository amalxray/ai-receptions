'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';

export default function StatsSection({ stats }: { stats: { clinics_count: number; patients_count: number; cities_count: number } }) {
  const items = [
    { value: stats.clinics_count, suffix: '+', label: 'عيادة ومركز', icon: '🏥' },
    { value: stats.patients_count, suffix: '+', label: 'مريض في النظام', icon: '😊' },
    { value: stats.cities_count, suffix: '', label: 'مدن مغطاة', icon: '🗺️' },
    { value: 24, suffix: '/7', label: 'دعم متواصل', icon: '⏱️' },
  ];
  return (
    <section className="border-y border-blue-100 bg-white/80 py-14">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
        {items.map((item, i) => (
          <BlurFade key={item.label} delay={i * 0.1} inView>
            <div className="group text-center">
              <div className="mb-1 flex justify-center">
                <span className="inline-block text-3xl transition-transform duration-300 group-hover:scale-125 animate-bounce">{item.icon}</span>
              </div>
              <div className="flex items-center justify-center bg-gradient-to-l from-blue-600 via-cyan-500 to-indigo-600 bg-clip-text text-4xl font-black text-transparent drop-shadow-[0_0_12px_rgba(6,182,212,0.35)]">
                <NumberTicker value={item.value} />
                <span>{item.suffix}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">{item.label}</div>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}
