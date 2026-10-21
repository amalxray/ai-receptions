'use client';

import { motion } from 'framer-motion';
import { ScanFace, Radiation, Bone, Stethoscope, Sparkles } from 'lucide-react';

interface Service {
  name: string;
  price: number | null;
  price_min?: number | null;
  price_max?: number | null;
  duration_minutes?: number | null;
  description?: string | null;
}

interface Props {
  services: Service[];
  activityType: 'clinic' | 'imaging_center' | 'dental_lab';
}

function iconFor(name: string) {
  if (/بانوراما|Panorama/i.test(name)) return ScanFace;
  if (/CBCT|طبقي|طبقية/i.test(name)) return Radiation;
  if (/مفصل/i.test(name)) return Bone;
  if (/تنظيف|حشو|علاج/i.test(name)) return Stethoscope;
  return Sparkles;
}

function priceDisplay(s: Service): string {
  if (s.price_min != null && s.price_max != null) return `${s.price_min}-${s.price_max} ₪`;
  if (s.price != null) return `${s.price} ₪`;
  return 'حسب الطلب';
}

export default function PublicServicesCard({ services, activityType }: Props) {
  const title =
    activityType === 'imaging_center'
      ? 'خدمات التصوير'
      : activityType === 'dental_lab'
        ? 'خدمات المختبر'
        : 'خدماتنا';

  if (services.length === 0) return null;

  return (
    <section className="max-w-4xl mx-auto my-8 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/95 backdrop-blur-2xl p-8 shadow-2xl shadow-cyan-500/10">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-400 via-white to-emerald-400 bg-clip-text text-transparent">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {services.map((service, idx) => {
          const Icon = iconFor(service.name);
          const duration =
            service.duration_minutes != null ? `${service.duration_minutes} دقيقة` : null;
          return (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.03, y: -5 }}
              className="group rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition-all duration-300 hover:border-cyan-400/50 hover:bg-cyan-500/5 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]"
            >
              <Icon className="mx-auto h-10 w-10 text-cyan-400 mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">{service.name}</h3>
              <p className="text-3xl font-black text-cyan-400 mb-1">
                {priceDisplay(service)}
              </p>
              {duration && (
                <p className="text-xs text-slate-400">{duration}</p>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
