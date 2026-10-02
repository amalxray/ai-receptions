import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { ActivitySpaceChrome, ContactBlock, WorkingHoursBlock } from '@/components/public/ActivitySpaceChrome';

/**
 * PHASE C — Imaging / Radiology Center public space.
 * Section order follows the owner-approved journey:
 *   1) Hero (Chrome)  2) Logo/identity (Chrome)  3) CTA (Chrome)
 *   4) Gallery (Chrome — moved up)  5) Imaging services  6) About (Chrome)
 *   7) How the examination works  8) Preparation / report / delivery
 *   9) Working hours  10) Location/contact  11) AI reception (Chrome widget)
 * Domain data comes from the imaging_services catalog; honest copy only —
 * no invented equipment, prices or providers.
 */

const MODALITY_LABELS: Record<string, string> = {
  panoramic: 'بانوراما',
  intraoral: 'داخل الفم',
  cbct: 'تصوير ثلاثي الأبعاد (CBCT)',
  cephalometric: 'تصوير جانبي للجمجمة',
};

/**
 * B18 — price label for a public imaging service.
 *
 * A row whose `pricing_mode` is 'unspecified' but that CARRIES a positive price
 * (legacy/seeded rows, or a service saved before the mode was enforced) used to
 * render NO price at all — the owner saw a price in the dashboard and nothing on
 * the site. A positive price is announced as fixed; 0/null keeps meaning
 * "no price". Exported for unit tests (pure function).
 */
export function imagingServicePriceLabel(svc: { pricing_mode: string | null; price: number | null; price_min: number | null; price_max: number | null; price_note: string | null }): string | null {
  const fallback = svc.price_note?.trim() || 'حسب حالة الفحص';
  switch (svc.pricing_mode) {
    case 'fixed':
      return svc.price != null && Number(svc.price) > 0 ? `${svc.price} ₪` : fallback;
    case 'range':
      return svc.price_min != null && svc.price_max != null ? `${svc.price_min}–${svc.price_max} ₪` : fallback;
    case 'estimate':
      return svc.price_min != null && Number(svc.price_min) > 0 ? `≈${svc.price_min} ₪` : fallback;
    case 'unspecified': {
      const price = svc.price != null ? Number(svc.price) : null;
      return price != null && price > 0 ? `${price} ₪` : fallback;
    }
    default:
      return fallback;
  }
}

export function ImagingPublicSpace({ space }: { space: ActivityPublicSpace }) {
  const hasImaging = space.imagingServices.length > 0;
  const hasShared = space.services.length > 0;
  return (
    <ActivitySpaceChrome
      space={space}
      headline={space.name}
      children={
        <>
          {/* 5) Imaging services / modalities */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">خدمات التصوير والفحوصات</h2>
            {hasImaging ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {space.imagingServices.map((svc, index) => (
                  <li key={svc.name} className="public-card group relative overflow-hidden rounded-3xl border border-cyan-100 bg-gradient-to-br from-white via-white to-sky-50/80 p-5 shadow-[0_12px_35px_rgba(8,145,178,0.07)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-cyan-300 hover:shadow-[0_22px_45px_rgba(8,145,178,0.2)]">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-400/20 text-3xl shadow-inner shadow-cyan-500/10 transition duration-300 group-hover:scale-110 group-hover:shadow-[0_0_24px_rgba(6,182,212,0.28)]" aria-hidden="true">
                        {svc.modality === 'panoramic' ? '🦷' : svc.modality === 'cbct' ? '🩻' : ['📷', '✨', '🔬'][index % 3]}
                      </span>
                      {imagingServicePriceLabel(svc) && <span className="rounded-full border border-cyan-100 bg-white/85 px-3 py-1.5 text-xs font-bold text-brand-cyan shadow-sm">{imagingServicePriceLabel(svc)}</span>}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 transition group-hover:text-brand-cyan">{svc.name}</h3>
                      {svc.description && <p className="mt-1 text-sm text-slate-500">{svc.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {svc.modality && <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-600">{MODALITY_LABELS[svc.modality] ?? svc.modality}</span>}
                        {svc.duration_minutes != null && <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-600">⏱ {svc.duration_minutes} دقيقة</span>}
                      </div>
                      {svc.preparation_instructions && <p className="mt-3 text-xs leading-relaxed text-slate-500">التحضير: {svc.preparation_instructions}</p>}
                      {svc.report_policy && <p className="mt-1 text-xs leading-relaxed text-slate-500">التقرير: {svc.report_policy}</p>}
                      {svc.delivery_methods.length > 0 && <p className="mt-1 text-xs leading-relaxed text-slate-500">التسليم: {svc.delivery_methods.join('، ')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : hasShared ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {space.services.map((service, index) => (
                  <li key={`${service.name}-${service.duration_minutes ?? 0}`} className="public-card group rounded-3xl border border-cyan-100 bg-gradient-to-br from-white to-sky-50/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-cyan-300 hover:shadow-[0_22px_45px_rgba(8,145,178,0.2)]">
                    <div>
                      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/10 text-3xl transition group-hover:scale-110 group-hover:shadow-[0_0_24px_rgba(6,182,212,0.25)]" aria-hidden="true">{['🩺', '🦷', '✨'][index % 3]}</div>
                      <h3 className="text-lg font-bold text-slate-800 group-hover:text-brand-cyan">{service.name}</h3>
                      {service.description && <p className="mt-1 text-sm text-slate-500">{service.description}</p>}
                    </div>
                    {service.price != null && (
                      <span className="mt-3 inline-flex rounded-full bg-white/85 px-3 py-1.5 text-xs font-bold text-brand-cyan shadow-sm">
                        {service.price > 0 ? `${service.price} ₪` : 'حسب حالة الفحص'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                لم تُنشر خدمات التصوير بعد — تواصل مع المركز للاستفسار.
              </p>
            )}
          </section>

          {/* 7) How the examination works — generic honest flow, no invented details */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">كيف تتم الفحصية؟</h2>
            <ol className="relative grid gap-4 sm:grid-cols-3">
              <div aria-hidden="true" className="absolute right-[16%] top-7 hidden h-0.5 w-[68%] bg-gradient-to-l from-cyan-300 via-teal-400 to-emerald-300 sm:block" />
              <li className="relative rounded-3xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(8,145,178,0.16)]">
                <span className="relative z-10 mb-4 grid h-14 w-14 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-cyan-500 to-teal-500 text-xl font-black text-white shadow-[0_0_24px_rgba(6,182,212,0.35)]">١</span>
                <p className="text-base font-bold text-slate-800">📋 الطلب</p>
                <p className="mt-1 text-sm text-slate-500">اختر الفحص المطلوب عبر الحجز أو الاستقبال الذكي، أو أحضر إحالة عيادتك.</p>
              </li>
              <li className="relative rounded-3xl border border-teal-100 bg-gradient-to-br from-white to-teal-50/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(13,148,136,0.16)]">
                <span className="relative z-10 mb-4 grid h-14 w-14 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-teal-500 to-emerald-500 text-xl font-black text-white shadow-[0_0_24px_rgba(20,184,166,0.35)]">٢</span>
                <p className="text-base font-bold text-slate-800">🩻 الفحص</p>
                <p className="mt-1 text-sm text-slate-500">يُلتقط التصوير في الموعد المحدد وفق تعليمات التحضير الخاصة بكل فحص.</p>
              </li>
              <li className="relative rounded-3xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(16,185,129,0.16)]">
                <span className="relative z-10 mb-4 grid h-14 w-14 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-emerald-500 to-cyan-500 text-xl font-black text-white shadow-[0_0_24px_rgba(16,185,129,0.35)]">٣</span>
                <p className="text-base font-bold text-slate-800">📤 التقرير والتسليم</p>
                <p className="mt-1 text-sm text-slate-500">يُسلّم التقرير والصور بالطريقة المتفق عليها (طباعة/واتساب/إيميل/DICOM حسب الفحص).</p>
              </li>
            </ol>
          </section>

          {/* 8) Preparation / report / delivery policy */}
          <section className="mb-10 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-xl font-semibold text-slate-800">التحضير والتقرير والتسليم</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              تظهر تعليمات التحضير وسياسة التقرير وطرق التسليم لكل فحص كما يحددها المركز في كتالوج الخدمات.
              لأي تفاصيل إضافية تواصل مع المركز مباشرة.
            </p>
          </section>

          {/* 9) Hours */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">ساعات العمل</h2>
            <WorkingHoursBlock space={space} />
          </section>

          {/* 10) Center info */}
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-semibold text-slate-800">معلومات المركز</h2>
            <ContactBlock space={space} />
          </section>
        </>
      }
    />
  );
}
