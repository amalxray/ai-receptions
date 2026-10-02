import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { ActivitySpaceChrome, ContactBlock, WorkingHoursBlock, InitialsBrandMark } from '@/components/public/ActivitySpaceChrome';

/**
 * Dental Technician / Dental Lab public space (Phase C).
 * Laboratory/technician-oriented — NOT a doctor clinic or imaging center.
 * Presents laboratory services (turnaround-aware), case/referring-clinic
 * collaboration concepts, and request CTAs. Domain data sourced from the
 * additive lab_services catalog (tenant-scoped).
 */

export function DentalLabPublicSpace({ space }: { space: ActivityPublicSpace }) {
  const hasLab = space.labServices.length > 0;
  const hasShared = space.services.length > 0;
  return (
    <ActivitySpaceChrome
      space={space}
      headline={space.name}
      children={
        <>
          {/* Collaboration concept */}
          <section className="mb-10 rounded-xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              نتعاون مع العيادات والأطباء لتنفيذ حالات الأسنان — من الاستقبال إلى التسليم.
              أرسل حالة، أو استفسر عن خدماتنا مباشرة عبر الاستقبال الذكي.
            </p>
          </section>

          {/* Lab services */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">خدمات المختبر</h2>
            {hasLab ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {space.labServices.map((svc, index) => (
                  <li key={svc.name} className="public-card group rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-white to-violet-50/70 p-5 shadow-[0_12px_35px_rgba(109,40,217,0.06)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-violet-300 hover:shadow-[0_22px_45px_rgba(109,40,217,0.18)]">
                    <div>
                      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-400/20 text-3xl transition duration-300 group-hover:scale-110 group-hover:shadow-[0_0_24px_rgba(139,92,246,0.25)]" aria-hidden="true">{['🦷', '🧪', '✨'][index % 3]}</div>
                      <h3 className="text-lg font-bold text-slate-800 transition group-hover:text-violet-700">{svc.name}</h3>
                      {svc.description && (
                        <p className="mt-1 text-sm text-slate-500">{svc.description}</p>
                      )}
                      {svc.turnaround_hours != null && (
                        <p className="mt-3 inline-flex rounded-full border border-violet-100 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
                          مدة الإنجاز: {svc.turnaround_hours} ساعة
                        </p>
                      )}
                    </div>
                    {svc.price != null && (
                      <span className="mt-3 inline-flex rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm">{svc.price} ₪</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : hasShared ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {space.services.map((service, index) => (
                  <li key={`${service.name}-${service.duration_minutes ?? 0}`} className="public-card group rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-violet-300 hover:shadow-[0_22px_45px_rgba(109,40,217,0.18)]">
                    <div>
                      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/10 text-3xl transition group-hover:scale-110" aria-hidden="true">{['🦷', '🧪', '✨'][index % 3]}</div>
                      <h3 className="text-lg font-bold text-slate-800 group-hover:text-violet-700">{service.name}</h3>
                      {service.description && (
                        <p className="mt-1 text-sm text-slate-500">{service.description}</p>
                      )}
                    </div>
                    {service.price != null && (
                      <span className="mt-3 inline-flex rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm">{service.price} ₪</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                لم تُنشر خدمات المختبر بعد — تواصل مع المختبر للاستفسار.
              </p>
            )}
          </section>

          {/* Turnaround / collaboration concept */}
          <section className="mb-10 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-xl font-semibold text-slate-800">التعاون مع العيادات</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              أرسل حالة أو استفسارًا عبر الاستقبال الذكي، وسيتولى المختبر متابعة الطلب والإنتاج
              والتسليم مع توضيح المدة المتوقعة لكل حالة.
            </p>
          </section>

          {/* Hours */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">ساعات العمل</h2>
            <WorkingHoursBlock space={space} />
          </section>

          {/* Lab info */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">معلومات المختبر</h2>
            <ContactBlock space={space} />
          </section>
        </>
      }
    />
  );
}