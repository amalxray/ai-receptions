'use client';

import type { CSSProperties } from 'react';
import { ScanFace, Radiation, Bone, Stethoscope, Sparkles } from 'lucide-react';
import BookIn30Button from '@/components/public/BookIn30Button';

interface Service {
  id: string;
  name: string;
  price: number | null;
  price_min?: number | null;
  price_max?: number | null;
  duration_minutes?: number | null;
  description?: string | null;
}

interface Props {
  clinicId: string;
  services: Service[];
  activityType: 'clinic' | 'imaging_center' | 'dental_lab';
  sectionKey?: string;
  className?: string;
  style?: CSSProperties;
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

export default function PublicServicesCard({ clinicId, services, activityType, sectionKey = 'clinic_services', className, style }: Props) {
  const title =
    activityType === 'imaging_center'
      ? 'خدمات التصوير'
      : activityType === 'dental_lab'
        ? 'خدمات المختبر'
        : 'خدماتنا';

  return (
    <section
      data-section-key={sectionKey}
      className={['max-w-4xl mx-auto my-8 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/95 backdrop-blur-2xl p-8 shadow-2xl shadow-cyan-500/10', className].filter(Boolean).join(' ')}
      style={style}
    >
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-400 via-white to-emerald-400 bg-clip-text text-transparent">
        {title}
      </h2>
      {services.length === 0 ? (
        <p className="text-center text-sm text-slate-300">لا توجد خدمات منشورة بعد.</p>
      ) : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, idx) => {
          const Icon = iconFor(service.name);
          const duration =
            service.duration_minutes != null ? `${service.duration_minutes} دقيقة` : null;
          return (
            <article
              key={idx}
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
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <BookIn30Button
                  clinicId={clinicId}
                  serviceId={service.id}
                  serviceName={service.name}
                  activityType={activityType}
                />
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('clinic-chat:open', {
                    detail: { message: `أريد الاستفسار عن خدمة ${service.name}` },
                  }))}
                  className="rounded-xl border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300/10"
                >
                  اسأل الاستقبال
                </button>
              </div>
            </article>
          );
        })}
      </div>}
    </section>
  );
}
