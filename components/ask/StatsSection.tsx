'use client';

import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Building2, Users, MapPin, Clock } from 'lucide-react';

export default function StatsSection({ stats }: { stats: { clinics_count: number; patients_count: number; cities_count: number } }) {
  const items = [
    { value: stats.clinics_count, suffix: '+', label: 'عيادة ومركز', icon: Building2 },
    { value: stats.patients_count, suffix: '+', label: 'مريض في النظام', icon: Users },
    { value: stats.cities_count, suffix: '', label: 'مدن مغطاة', icon: MapPin },
    { value: 24, suffix: '/7', label: 'دعم متواصل', icon: Clock },
  ];
  return (
    <section className="relative py-14 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/80 via-white to-cyan-50/80"></div>
      <div className="absolute inset-0 backdrop-blur-sm"></div>
      <div className="relative mx-auto grid max-w-4xl grid-cols-2 gap-6 px-4 md:grid-cols-4">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <BlurFade key={item.label} delay={i * 0.1} inView>
              <div className="group relative text-center backdrop-blur-md bg-white/70 border border-white/60 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 rounded-2xl"></div>
                <div className="relative">
                  <div className="mb-2 flex justify-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-6 h-6 text-indigo-600" />
                    </div>
                  </div>
                  <div className="flex items-center justify-center bg-gradient-to-l from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-4xl font-black text-transparent drop-shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                    <NumberTicker value={item.value} />
                    <span>{item.suffix}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-700">{item.label}</div>
                </div>
              </div>
            </BlurFade>
          );
        })}
      </div>
    </section>
  );
}
