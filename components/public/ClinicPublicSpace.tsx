import type { ReactNode } from 'react';
import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { ActivitySpaceChrome, ContactBlock, WorkingHoursBlock, InitialsBrandMark } from '@/components/public/ActivitySpaceChrome';

/**
 * Clinic / Doctor Clinic public space (Phase C + premium redesign).
 * Reuses and evolves the 15D clinic public experience (identity, services,
 * hours, contact, booking/chat CTAs) — doctor/clinic-oriented.
 *
 * Visual language: light healthcare (white + cyan/emerald), calm floating
 * wellness blobs, premium cards with lift/hover, pill CTAs. Motion is gated
 * behind `prefers-reduced-motion` in globals.css.
 */

export function ClinicPublicSpace({ space, servicesCard }: { space: ActivityPublicSpace & { subscriptionExpired?: boolean }; servicesCard?: ReactNode }) {
  const hasProviders = space.providers.length > 0;
  const hasAds = space.ads.length > 0;
  return (
    <ActivitySpaceChrome
      space={space}
      headline={space.name}
      children={
        <>
          {servicesCard}
          {/* Empathy / pain → solution (PR-EMO) */}
          <section className="mb-10 rounded-3xl border border-brand-cyan/25 bg-gradient-to-l from-brand-cyan/10 via-white to-slate-50 p-6 text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              مشغول في العمل؟ لا وقت للمكالمات؟ اكتب مشكلتك للاستقبال الذكي وسيساعدك على
              اختيار الخدمة المناسبة وحجز الوقت المناسب — خطوة بخطوة ودون ضغط.
            </p>
          </section>

          {/* Announcements / offers (clinic_ads) */}
          {hasAds && (
            <section className="mb-10">
              <h2 className="mb-4 text-xl font-bold text-slate-800">عروض وإعلانات</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {space.ads.map((ad) => (
                  <div
                    key={ad.title}
                    className="public-card rounded-2xl border border-brand-cyan/25 bg-white p-5 hover:border-brand-cyan/50"
                  >
                    <h3 className="font-bold text-slate-800">🎉 {ad.title}</h3>
                    {ad.description && <p className="mt-2 text-sm leading-relaxed text-slate-500">{ad.description}</p>}
                    {ad.cta_link && (
                      <a href={ad.cta_link} className="mt-3 inline-block text-sm font-semibold text-brand-cyan hover:text-brand-cyan/80">
                        {ad.cta_text} ←
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Providers (dentists) */}
          {hasProviders && (
            <section className="mb-10">
              <h2 className="mb-4 text-xl font-bold text-slate-800">الأطباء</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {space.providers.map((p) => (
                  <div key={p.name} className="public-card flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-cyan/50">
                    <InitialsBrandMark name={p.name} className="h-14 w-14 shrink-0 rounded-full text-lg" />
                    <div>
                      <h3 className="font-bold text-slate-800">{p.name}</h3>
                      {(p.title || p.specialty) && (
                        <p className="mt-0.5 text-sm text-slate-500">{[p.title, p.specialty].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Hours */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-slate-800">ساعات العمل</h2>
            <WorkingHoursBlock space={space} />
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold text-slate-800">مكان العمل والتواصل</h2>
            <ContactBlock space={space} />
          </section>

          {/* Action */}
          <section className="rounded-3xl border border-brand-cyan/30 bg-gradient-to-l from-brand-cyan/15 via-white to-slate-50 p-6 text-center">
            <h2 className="text-xl font-bold text-slate-800">جاهز للخطوة التالية؟</h2>
            <p className="mt-2 text-sm text-slate-500">
              استخدم زر «احجز موعدًا» أعلى الصفحة، أو اسأل الاستقبال الذكي عن أي خدمة.
            </p>
          </section>
        </>
      }
    />
  );
}
