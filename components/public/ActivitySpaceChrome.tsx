'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ACTIVITY_TYPE_LABELS_AR } from '@/lib/services/activityTypes';
import type { ActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { ShareSection } from '@/components/public/ShareSection';
import PublicGalleryLightbox from '@/components/public/PublicGalleryLightbox';
import HoursStatusBadge from '@/components/public/HoursStatusBadge';
import BeforeAfterSlider from '@/components/public/BeforeAfterSlider';
import ShareButtons from '@/components/ask/ShareButtons';
import { ownerLoginUrl } from '@/lib/services/dashboardPaths';
import FloatingChatWidget from '@/components/chat/FloatingChatWidget';

// Map loads only on the client (CDN Leaflet) — never during SSR.
const PublicLocationMap = dynamic(() => import('@/components/public/PublicLocationMap'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />,
});

/**
 * Shared chrome for activity public spaces (Phase C + redesign).
 * Renders tenant identity + CTAs genuinely common across clinic /
 * imaging-center / dental-lab spaces. Activity-specific sections live in
 * the per-activity components, not here.
 *
 * Visual language: modern, premium, medical — dark glass panels, subtle
 * gradient hero, teal/cyan accent, entrance animations gated behind
 * `prefers-reduced-motion`, RTL-first.
 */

const WEEKDAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Gallery categories (Phase 2) — kept local: the service module imports
 * node crypto + supabase admin and must never reach the client bundle. */
const GALLERY_CATEGORIES = [
  { value: 'clinic', label: 'العيادة', icon: '🏥' },
  { value: 'team', label: 'الطاقم', icon: '👥' },
  { value: 'equipment', label: 'المعدات', icon: '🩺' },
  { value: 'cases', label: 'حالات', icon: '📋' },
  { value: 'other', label: 'أخرى', icon: '📁' },
] as const;

export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return time;
  const h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Deterministic initials-based brand mark when no logo is uploaded. */
export function themeRadius(shape: string | undefined): number {
  switch (shape) {
    case 'squared': return 10;
    case 'rounded': return 18;
    default: return 9999;
  }
}

export function themePadSize(size: string | undefined): { px: number; py: number; fontSize: number } {
  switch (size) {
    case 'small': return { px:16, py:8, fontSize:13 };
    case 'large': return { px:32, py:16, fontSize:17 };
    default: return { px:22, py:12, fontSize:15 };
  }
}

export function tickerDuration(speed: string | undefined): number {
  switch (speed) {
    case 'slow': return 45;
    case 'fast': return 15;
    default: return 28;
  }
}

/** PHASE 2 — news ticker bar height (owner-bounded enum → approved class). */
export function newsHeightClass(size: string | undefined): string {
  switch (size) {
    case 'xs': return 'h-8';
    case 'sm': return 'h-12';
    case 'lg': return 'h-20';
    case 'xl': return 'h-24';
    default: return 'h-16'; // md — larger default per owner fix (old bar was tiny)
  }
}

/** PHASE 2 — news ticker font scale (owner-bounded enum → approved class). */
export function newsFontClass(font: string | undefined): string {
  switch (font) {
    case 'sm': return 'text-sm';
    case 'lg': return 'text-lg';
    case 'xl': return 'text-xl';
    case '2xl': return 'text-2xl';
    default: return 'text-base'; // base — readable default (old was text-xs)
  }
}

export function InitialsBrandMark({
  name,
  className = 'h-20 w-20 text-2xl',
}: {
  name: string;
  className?: string;
}) {
  const trimmed = name.trim();
  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-2xl border border-teal-400/40 bg-gradient-to-br from-teal-500/20 via-slate-800 to-slate-900 font-extrabold text-teal-200 shadow-inner ${className}`}
    >
      {initials || name.charAt(0)}
    </span>
  );
}

function BrandLogo({ space, size = 'lg' }: { space: ActivityPublicSpace; size?: 'lg' | 'sm' }) {
  const cls =
    size === 'lg'
      ? 'h-24 w-24 rounded-3xl border-2 border-teal-400/50 object-cover shadow-lg shadow-teal-500/10'
      : 'h-12 w-12 rounded-xl border border-teal-400/40 object-cover';
  if (space.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={space.logo} alt={`شعار ${space.name}`} className={cls} />;
  }
  return (
    <InitialsBrandMark name={space.name} className={size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-12 w-12 text-lg'} />
  );
}

function StaggerReveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={`animate-reveal ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

export function ActivitySpaceChrome({
  space,
  headline,
  children,
}: {
  space: ActivityPublicSpace;
  headline: string;
  children: React.ReactNode;
}) {
  const locationBits = [space.city, space.area].filter(Boolean) as string[];
  const hasAddress = Boolean(space.address);
  // Rebrand: «اطلب خدمة» → «احجز موعد» (revert: space.activityType === 'clinic' ? 'احجز موعدًا' : 'اطلب خدمة')
  const ctaLabel = space.activityType === 'clinic' ? 'احجز موعدًا' : 'احجز موعد';
  /** Section visibility toggle (default: visible when unset) — owner-controlled. */
  const on = (key: string) => space.sections?.[key] !== false;
  const showBooking = on('bookingCta') || on('hero');
  const showAi = on('aiCta');
  const d = space.display;
  const bodyScale =
    d?.body_text === 'small' ? ' text-sm' : d?.body_text === 'large' ? ' text-lg' : ' text-base';
  const headingCls =
    d?.heading === 'small'
      ? 'text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl'
      : d?.heading === 'large'
        ? 'text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl'
        : 'text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl';

  // Public Chat UX (Phase 8): the conversation opens INSIDE this public page
  // via the FloatingChatWidget (embedded ChatInterface) — never a redirect to
  // /chat. The widget keeps clinic scope from the same `space.clinicId`.
  const [chatSignal, setChatSignal] = useState(0);
  const openChat = () => setChatSignal((n) => n + 1);
  useEffect(() => {
    const onOpenChat = () => setChatSignal((n) => n + 1);
    window.addEventListener('clinic-chat:open', onOpenChat as EventListener);
    return () => window.removeEventListener('clinic-chat:open', onOpenChat as EventListener);
  }, []);

  return (
    <div dir="rtl" className={`min-h-screen text-slate-800${bodyScale}`} style={{ backgroundColor: space.theme?.background_color ?? '#f6f8ff' }} >
      {/* Floating wellness blobs + bubbles (calm, reduced-motion safe) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-[-5%] h-[28rem] w-[28rem] rounded-full bg-brand-cyan/15 blur-3xl animate-float-slow" />
        <div className="absolute top-1/4 left-[-8%] h-80 w-80 rounded-full bg-brand-emerald/10 blur-3xl animate-float-slower" />
        <div className="absolute bottom-[-10%] left-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl animate-float-slow" />
        <span className="absolute top-[18%] right-[12%] h-3 w-3 rounded-full bg-brand-cyan/30 animate-drift" />
        <span className="absolute top-[30%] left-[18%] h-2 w-2 rounded-full bg-brand-emerald/30 animate-drift" style={{ animationDelay: '2s' }} />
        <span className="absolute top-[12%] left-[38%] h-2.5 w-2.5 rounded-full bg-cyan-400/30 animate-drift" style={{ animationDelay: '4s' }} />
      </div>

      {/* PHASE L — news ticker (owner-managed; bounded colors/speed/height/font) */}
      {on('news') && space.news.length > 0 && (
        <div
          dir="ltr"
          className={`flex items-center overflow-hidden border-b border-white/10 ${newsHeightClass(d?.news_height)}`}
          style={{ backgroundColor: space.theme?.primary_color ?? '#0e7490' }}
        >
          <div
            className={`flex w-max animate-ticker items-center gap-10 px-4 ${newsFontClass(d?.news_font)}`}
            style={{ animationDuration: `${tickerDuration((space.news[0] ?? {}).speed as string | undefined)}s` }}
          >
            {[...space.news, ...space.news].map((n, i) => (
              <a
                key={`${n.id}-${i}`}
                href={n.link ?? undefined}
                target={n.link ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="whitespace-nowrap text-xs font-medium"
                style={{ color: n.text_color ?? '#ffffff' }}
              >
                {n.text}{n.link ? ' ↗' : ''}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sticky CTA row: booking + owner dashboard entry */}
      <div className="sticky top-3 z-20 mx-auto flex w-fit flex-wrap items-center justify-center gap-3 px-4">
        {showBooking && (
          <a
            href={space.bookingUrl}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-cyan px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-cyan/25 backdrop-blur transition hover:-translate-y-0.5 hover:bg-brand-cyan/90"
            style={{
              backgroundColor: space.theme?.primary_color,
              borderRadius: themeRadius(space.theme?.button_shape),
              padding: `${themePadSize(space.theme?.button_size).py}px ${themePadSize(space.theme?.button_size).px}px`,
              fontSize: themePadSize(space.theme?.button_size).fontSize,
              boxShadow: space.theme?.button_shadow === false ? 'none' : undefined,
            }}
          >
            {ctaLabel} ←
          </a>
        )}
        <a
          href={ownerLoginUrl(space.slug)}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-cyan/60 hover:text-brand-cyan"
        >
          لوحة التحكم / دخول المالك
        </a>
      </div>

      <main>
        {/* Hero — cover image is its own clean band (no text on top); copy sits
            in a separate section below, so the owner's cover stays readable
            with owner-controlled blur / focus point / vertical offset. */}
        <section>
          <div className="relative overflow-hidden" style={{ height: `${d?.cover_height ?? 384}px` }}>
            {space.coverUrl && !/facebook\.com|fbcdn\.net|instagram\.com/i.test(space.coverUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={space.coverUrl.replace(/[^a-zA-Z0-9:/._~?-]/g, '')}
                alt={`غلاف ${space.name}`}
                className="h-full w-full"
                style={{
                  objectFit: d?.cover_fit ?? 'cover',
                  objectPosition: `${d?.cover_position ?? 'center'} ${d?.cover_offset_y ?? 50}%`,
                  filter: d?.cover_blur ? `blur(${d.cover_blur}px)` : undefined,
                  // Slight overscale so blur edges never show a hard cutoff.
                  transform: d?.cover_blur ? 'scale(1.03)' : undefined,
                }}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-brand-cyan/15 via-white to-brand-emerald/10" />
            )}
          </div>
        </section>

        {/* Hero copy — dedicated section below the cover */}
        <section className="border-b border-slate-200/70 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:py-16">
            <StaggerReveal>
              <div className="mb-6 flex justify-center">
                <BrandLogo space={space} />
              </div>
            </StaggerReveal>
            <StaggerReveal delay={80}>
              <p className="mx-auto mb-3 inline-block rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-cyan">
                {ACTIVITY_TYPE_LABELS_AR[space.activityType]}
              </p>
            </StaggerReveal>
            <StaggerReveal delay={140}>
              <h1 className={headingCls}>{headline}</h1>
              {space.tagline && <p className="mt-3 text-lg font-medium text-brand-cyan/90">{space.tagline}</p>}
            </StaggerReveal>
            <StaggerReveal delay={200}>
              {locationBits.length > 0 && (
                <p className="mt-3 text-sm font-medium text-slate-500">
                  📍 {locationBits.join(' — ')}
                  {hasAddress && <span className="text-slate-400"> · {space.address}</span>}
                </p>
              )}
            </StaggerReveal>
            <StaggerReveal delay={230}>
              {space.workingHours.length > 0 && <HoursStatusBadge slug={space.slug} />}
            </StaggerReveal>
            {space.description && (
              <StaggerReveal delay={260}>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
                  {space.description}
                </p>
              </StaggerReveal>
            )}
            <StaggerReveal delay={320}>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  href={space.bookingUrl}
                  className="inline-flex items-center justify-center rounded-full bg-brand-cyan px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-cyan/25 transition hover:-translate-y-0.5 hover:bg-brand-cyan/90 active:translate-y-0"
                  style={{
                    backgroundColor: space.theme?.primary_color,
                    borderRadius: themeRadius(space.theme?.button_shape),
                    padding: `${themePadSize(space.theme?.button_size).py}px ${themePadSize(space.theme?.button_size).px}px`,
                    fontSize: themePadSize(space.theme?.button_size).fontSize,
                    boxShadow: space.theme?.button_shadow === false ? 'none' : undefined,
                  }}
                >
                  {ctaLabel}
                </a>
                {/* AI Chat hidden — re-enable by uncommenting
                {showAi && (
                  <button
                    type="button"
                    onClick={openChat}
                    className="inline-flex items-center justify-center rounded-full border border-cyan-300 bg-white/70 px-8 py-3.5 text-base font-semibold text-slate-700 backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-cyan hover:bg-white"
                  >
                    💬 تحدث مع الاستقبال الذكي
                  </button>
                )}
                */}
              </div>
            </StaggerReveal>
            <StaggerReveal delay={380}>
              <p className="mt-4 text-xs text-slate-500">
                أتحدث مباشرة مع نظام {space.name} — بدون وسيط، على مدار الساعة.
              </p>
            </StaggerReveal>
            <StaggerReveal delay={440}>
              <div className="mt-6 flex justify-center">
                <div className="inline-flex rounded-2xl bg-slate-900/90 px-4 py-2 shadow-lg">
                  <ShareButtons url={space.pageUrl} title={`${space.name} — ${headline}`} />
                </div>
              </div>
            </StaggerReveal>
          </div>
        </section>

        {/* PHASE C — Gallery/visual showcase is a PRIMARY element (position 4) */}
        <PublicMediaGallery space={space} />

        {/* Phase 4 — before/after case showcase (consent-gated, owner-managed) */}
        {on('beforeAfter') && space.beforeAfter.length > 0 && (
          <section id="before-after" className="mx-auto w-full max-w-7xl px-4 pt-12">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-slate-800">قبل وبعد</h2>
              <p className="mt-1 text-sm text-slate-500">نتائج حقيقية — اسحب المقارنة لترى الفرق</p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {space.beforeAfter.map((c) => (
                <BeforeAfterSlider key={c.id} before={c.before_url} after={c.after_url} title={c.title} />
              ))}
            </div>
          </section>
        )}

        {/* PHASE L — achievements trust cards (right after the gallery) */}
        {on('achievements') && space.achievements.length > 0 && (
          <section id="achievements" className="mx-auto w-full max-w-7xl px-4 pt-12">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-slate-800">إنجازاتنا</h2>
              <p className="mt-1 text-sm text-slate-500">أرقام تعكس العمل والثقة</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {space.achievements.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl p-5 text-center text-white shadow-lg"
                  style={{ backgroundColor: a.background_color ?? '#0e7490' }}
                >
                  <div className={`font-extrabold ${a.font_size === 'small' ? 'text-2xl' : a.font_size === 'large' ? 'text-5xl' : 'text-4xl'}`}>{a.value}</div>
                  <p className="mt-1 text-sm font-semibold text-white/90">{a.icon ? `${a.icon} ` : ''}{a.title}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Phase 5 — verifiable achievement badges */}
        {on('badges') && space.badges.length > 0 && (
          <section id="badges" className="mx-auto w-full max-w-7xl px-4 pt-12">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-slate-800">شهادات وإنجازات</h2>
              <p className="mt-1 text-sm text-slate-500">اعتمادات موثّقة يمكن التحقق منها</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {space.badges.map((b) => {
                const inner = (
                  <>
                    {b.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.icon_url} alt={b.title} loading="lazy" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <span aria-hidden className="text-3xl">🏅</span>
                    )}
                    <div className="min-w-0 text-right">
                      <p className="truncate text-sm font-bold text-slate-800">{b.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[b.issuer, b.year].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </>
                );
                return b.verify_url ? (
                  <a
                    key={b.id}
                    href={b.verify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="public-card flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-cyan/50 hover:shadow-md"
                  >
                    {inner}
                    <span className="mr-auto text-[10px] font-semibold text-brand-cyan">تحقق ↗</span>
                  </a>
                ) : (
                  <div key={b.id} className="public-card flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        )}


        {/* Owner-managed about (shared across activities) */}
        {on('about') && space.about && (
          <div className="mx-auto max-w-3xl px-4 pt-10">
            <div className="public-card rounded-3xl border border-slate-200 bg-white/80 p-6">
              <h2 className="mb-2 text-lg font-bold text-slate-800">عن المنشأة</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{space.about}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="mx-auto max-w-5xl px-4 py-12">{children}</div>

        {/* PHASE L — testimonials + articles (social proof + education, after content) */}
        {on('testimonials') && space.testimonials.length > 0 && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-12">
            <h2 className="mb-6 text-center text-xl font-bold text-slate-800">ماذا يقول مرضانا</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {space.testimonials.map((t) => (
                <figure key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-amber-400" dir="ltr">{'★'.repeat(Math.max(1, Math.min(5, t.rating)))}</div>
                  <blockquote className="mt-2 text-sm leading-relaxed text-slate-600">"{t.content}"</blockquote>
                  <figcaption className="mt-3 flex items-center gap-2">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image_url} alt={t.patient_name} loading="lazy" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cyan/10 font-bold text-brand-cyan">{t.patient_name.charAt(0)}</span>
                    )}
                    <span className="text-sm font-semibold text-slate-700">{t.patient_name}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        {on('articles') && space.articles.length > 0 && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-14">
            <h2 className="mb-6 text-center text-xl font-bold text-slate-800">مقالات ومنشورات</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {space.articles.map((art) => (
                <article key={art.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {art.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art.image_url} alt={art.title} loading="lazy" className="mb-3 h-36 w-full rounded-xl object-cover" />
                  )}
                  {art.category && <span className="text-xs font-semibold text-brand-cyan">{art.category}</span>}
                  <h3 className="mt-1 font-bold text-slate-800">{art.title}</h3>
                  {art.published_at && (
                    <p className="mt-1 text-xs text-slate-400">{new Date(art.published_at).toLocaleDateString('ar')}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* QR / share */}
        {space.publicId && (
          <ShareSection clinicName={space.name} publicId={space.publicId} pageUrl={space.pageUrl} />
        )}

        <footer className="mt-6 border-t border-slate-200 py-10 text-center text-xs text-slate-500">
          © AI-Receptions · مساحة {ACTIVITY_TYPE_LABELS_AR[space.activityType]} ·{' '}
          <a href="/" className="text-brand-cyan/80 hover:text-brand-cyan hover:underline">
            منصة الاستقبال الذكي
          </a>
        </footer>
      </main>

      {/* Public Chat UX (Phase 8): embedded in the SAME page, not a redirect. */}
      {/* AI Chat hidden — re-enable by uncommenting
      {showAi && <FloatingChatWidget clinicId={space.clinicId} clinicName={space.name} externalOpenSignal={chatSignal} activityType={space.activityType} />}
      */}

    </div>
  );
}

export function WorkingHoursBlock({ space }: { space: ActivityPublicSpace }) {
  if (space.workingHours.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        لم تُحدّث ساعات العمل بعد.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <HoursStatusBadge slug={space.slug} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {space.workingHours.map((hour) => (
          <li
            key={hour.weekday}
            className="public-card flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-brand-cyan/40"
          >
            <span className="font-semibold text-slate-700">{WEEKDAY_NAMES_AR[hour.weekday] ?? WEEKDAY_NAMES_EN[hour.weekday] ?? '—'}</span>
            <span className="text-slate-500" dir="ltr">
              {formatTime(hour.start_time)} — {formatTime(hour.end_time)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContactBlock({ space }: { space: ActivityPublicSpace }) {
  return (
    <div className="public-card rounded-2xl border border-slate-200 bg-white p-5">
      <p className="font-bold text-slate-800">{space.name}</p>
      {[space.city, space.area, space.address].filter(Boolean).length > 0 && (
        <p className="mt-1 text-sm text-slate-500">
          {[space.city, space.area, space.address].filter(Boolean).join(' — ')}
        </p>
      )}
      {space.phone && (
        <a href={`tel:${space.phone}`} className="mt-2 inline-block text-sm font-semibold text-brand-cyan hover:text-brand-cyan/80" dir="ltr">
          📞 {space.phone}
        </a>
      )}
      {typeof space.latitude === 'number' && typeof space.longitude === 'number' && (
        <div className="mt-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <PublicLocationMap lat={space.latitude} lng={space.longitude} label={space.name} />
          </div>
          <a
            href={`https://www.google.com/maps?q=${space.latitude},${space.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-brand-cyan hover:text-brand-cyan/80"
          >
            🗺️ افتح في Google Maps
          </a>
        </div>
      )}
      {Object.entries(space.socialLinks ?? {}).filter(([, v]) => Boolean(v)).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {space.socialLinks?.email && (
            <a href={`mailto:${space.socialLinks.email}`} className="text-slate-500 hover:text-brand-cyan" dir="ltr">
              ✉️ {space.socialLinks.email}
            </a>
          )}
          {space.socialLinks?.website && (
            <a href={space.socialLinks.website} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-cyan" dir="ltr">
              🌐 الموقع
            </a>
          )}
          {space.socialLinks?.facebook && (
            <a href={space.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-cyan" dir="ltr">
              Facebook
            </a>
          )}
          {space.socialLinks?.instagram && (
            <a href={space.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-cyan" dir="ltr">
              Instagram
            </a>
          )}
          {space.socialLinks?.whatsapp && (
            <a href={space.socialLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-cyan" dir="ltr">
              WhatsApp
            </a>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={space.bookingUrl}
          className="rounded-full bg-brand-cyan px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-cyan/90"
        >
          احجز الآن
        </a>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('clinic-chat:open'))}
          className="rounded-full border border-cyan-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-cyan hover:bg-white"
        >
          استشارة
        </button>
      </div>
    </div>
  );
}


export function PublicMediaGallery({ space }: { space: ActivityPublicSpace }) {
  const media = space.media ?? [];
  const [activeCategory, setActiveCategory] = useState<string>('all');
  if (space.sections?.gallery === false || media.length === 0) return null;
  const d = space.display ?? undefined;
  const gap =
    d?.gallery_spacing === 'compact' ? 'gap-2' : d?.gallery_spacing === 'roomy' ? 'gap-5' : 'gap-4';
  const titleScale =
    d?.section_title === 'small' ? 'text-base' : d?.section_title === 'large' ? 'text-2xl' : 'text-xl';

  // Category filter — only shown when the owner actually used ≥2 categories.
  const usedCategories = GALLERY_CATEGORIES.filter((c) =>
    media.some((m) => (m.category ?? 'other') === c.value)
  );
  const filtered =
    activeCategory === 'all'
      ? media
      : media.filter((m) => (m.category ?? 'other') === activeCategory);

  return (
    <section id="gallery" className="mx-auto w-full max-w-7xl px-4 py-12">
      <div className="mb-6 text-center">
        <h2 className={`font-bold text-slate-800 ${titleScale}`}>معرض الأعمال</h2>
        <p className="mt-1 text-sm text-slate-500">لقطات من بيئة المنشأة وخدماتها</p>
      </div>

      {usedCategories.length > 1 ? (
        <div className="mb-6 flex flex-wrap justify-center gap-2" role="tablist" aria-label="تصنيفات المعرض">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              activeCategory === 'all'
                ? 'border-cyan-600 bg-cyan-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-cyan-400 hover:text-cyan-700'
            }`}
          >
            🖼 الكل ({media.length})
          </button>
          {usedCategories.map((c) => {
            const count = media.filter((m) => (m.category ?? 'other') === c.value).length;
            return (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={activeCategory === c.value}
                onClick={() => setActiveCategory(c.value)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  activeCategory === c.value
                    ? 'border-cyan-600 bg-cyan-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-cyan-400 hover:text-cyan-700'
                }`}
              >
                {c.icon} {c.label} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {/* PHASE 2 — MorphingDialog grid: each item springs open from its thumbnail */}
      <PublicGalleryLightbox media={filtered} gapClassName={gap} />
    </section>
  );
}

