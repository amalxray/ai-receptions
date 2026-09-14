'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';

export default function StatsSection({ stats }: { stats: { clinics_count: number; patients_count: number; cities_count: number } }) {
  const items = [
    { value: stats.clinics_count, suffix: '+', label: 'عيادة ومركز' },
    { value: stats.patients_count, suffix: '+', label: 'مريض في النظام' },
    { value: stats.cities_count, suffix: '', label: 'مدن مغطاة' },
    { value: 24, suffix: '/7', label: 'دعم متواصل' },
  ];
  return (
    <section className="py-14" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
        {items.map((item, i) => (
          <BlurFade key={item.label} delay={i * 0.1} inView>
            <div className="text-center">
              <div className="flex items-center justify-center text-4xl font-black text-cyan-300">
                <NumberTicker value={item.value} />
                <span>{item.suffix}</span>
              </div>
              <div className="mt-2 text-sm text-slate-400">{item.label}</div>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}
