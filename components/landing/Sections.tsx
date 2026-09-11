'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FOUNDING_SLOTS_TOTAL } from '@/lib/landing/landing-copy';
import { useLandingCopy } from '@/components/landing/LandingContent';
import LandingButton from './LandingButton';
import { FadeUp, Stagger, staggerItem } from './motion';

/* ────────────── Pain Stats ────────────── */
export function PainStats() {
  const copy = useLandingCopy();
  return (
    <section className="bg-landing-bg py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.painStats.title}
          </h2>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 md:grid-cols-3">
          {copy.painStats.cards.map((card, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="rounded-3xl border border-landing-indigo/10 bg-white p-8 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-landing-btn"
            >
              <p className="font-mono text-5xl font-bold text-landing-indigo">{card.value}</p>
              <p className="mt-4 text-base font-semibold text-landing-text">{card.label}</p>
              <p className="mt-3 text-sm leading-6 text-landing-text/60">{card.footnote}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────── Features ────────────── */
export function Features() {
  const copy = useLandingCopy();
  return (
    <section id="features" className="bg-landing-bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.features.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-landing-text/70">
            {copy.features.subtitle}
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {copy.features.cards.map((card, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="rounded-3xl border border-landing-indigo/10 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:border-landing-indigo/30 hover:shadow-landing-btn"
            >
              <span className="text-4xl">{card.icon}</span>
              <h3 className="mt-4 font-heading text-lg font-bold text-landing-text">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-landing-text/70">{card.desc}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────── For Doctors ────────────── */
const dotColors = [
  'bg-landing-indigo',
  'bg-pink-500',
  'bg-landing-cyan',
  'bg-landing-amber',
  'bg-landing-violet',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-blue-500',
  'bg-fuchsia-500',
  'bg-teal-400',
];

export function ForDoctors() {
  const copy = useLandingCopy();
  return (
    <section id="for-doctors" className="bg-landing-dark py-20 text-white lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <p className="text-center text-sm font-semibold text-landing-cyan">
            {copy.forDoctors.eyebrow}
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-center font-heading text-3xl font-extrabold sm:text-4xl">
            {copy.forDoctors.title}
          </h2>
        </FadeUp>

        <Stagger className="mt-14 space-y-3">
          {copy.forDoctors.points.map((point, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-landing-cyan/40 hover:bg-white/10"
            >
              <span
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-landing-dark ${dotColors[i % dotColors.length]} animate-num-float`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-heading text-base font-bold sm:text-lg">
                  {point.icon} {point.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-white/70">{point.desc}</p>
                {point.quote && (
                  <p className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-landing-cyan/90">
                    {point.quote}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </Stagger>

        <div className="mt-12 text-center">
          <LandingButton href="#pricing" size="lg">
            {copy.forDoctors.cta}
          </LandingButton>
        </div>
      </div>
    </section>
  );
}

/* ────────────── Gallery ────────────── */
export function Gallery() {
  const copy = useLandingCopy();
  const tiles = [
    { icon: '🦷', label: 'سن' },
    { icon: '🏥', label: 'عيادة' },
    { icon: '🪑', label: 'غرفة انتظار' },
    { icon: '🦷', label: 'رعاية' },
    { icon: '😁', label: 'ابتسامة' },
    { icon: '🏥', label: 'عيادة حديثة' },
  ];
  return (
    <section className="bg-landing-bg py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.gallery.title}
          </h2>
          <p className="mt-3 text-center text-landing-text/70">{copy.gallery.subtitle}</p>
        </FadeUp>
        <Stagger className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3">
          {tiles.map((tile, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-landing-indigo/10 bg-white text-landing-text shadow-sm transition hover:-translate-y-1 hover:shadow-landing-btn ${
                i % 3 === 0 ? 'aspect-[4/5]' : i % 3 === 1 ? 'aspect-[3/4]' : 'aspect-square'
              }`}
            >
              <span className="text-5xl">{tile.icon}</span>
              <span className="text-sm font-semibold text-landing-text/70">{tile.label}</span>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────── How It Works ────────────── */
export function HowItWorks() {
  const copy = useLandingCopy();
  return (
    <section id="how-it-works" className="bg-landing-bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.howItWorks.title}
          </h2>
        </FadeUp>
        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {/* Dashed connector */}
          <div className="absolute right-0 left-0 top-10 hidden h-px border-t-2 border-dashed border-landing-indigo/30 md:block" />
          {copy.howItWorks.steps.map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.15} className="relative text-center">
              <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-landing-indigo to-landing-violet font-mono text-xl font-bold text-white shadow-landing-btn">
                {step.num}
              </div>
              <h3 className="mt-5 font-heading text-lg font-bold text-landing-text">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-landing-text/70">{step.desc}</p>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────── Pricing ────────────── */
export function Pricing() {
  const copy = useLandingCopy();
  const [remaining, setRemaining] = useState<number>(FOUNDING_SLOTS_TOTAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/landing/founding-slots');
        const data = await res.json();
        if (!cancelled && typeof data.remaining === 'number') setRemaining(data.remaining);
      } catch { /* fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section id="pricing" className="bg-landing-bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.pricing.title}
          </h2>
        </FadeUp>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Founding (featured) card */}
          <FadeUp>
            <div className="relative overflow-hidden rounded-3xl border-2 border-landing-indigo bg-white p-8 shadow-landing-btn">
              <span className="absolute left-0 top-6 rounded-r-full bg-gradient-to-l from-landing-amber to-landing-amber/80 px-4 py-1 text-xs font-bold text-landing-dark">
                {copy.pricing.founding.badge}
              </span>
              <div className="mt-8 flex items-end gap-2">
                <span className="font-mono text-5xl font-bold text-landing-text">{copy.pricing.founding.price}</span>
                <span className="mb-1 text-sm text-landing-text/60">{copy.pricing.founding.per}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-landing-indigo">{copy.pricing.founding.note}</p>
              <div className="mt-6">
                <LandingButton href="#founding" size="lg" className="w-full">
                  احجز مكانك
                </LandingButton>
              </div>
            </div>
          </FadeUp>

          {/* Standard card */}
          <FadeUp delay={0.1}>
            <div className="rounded-3xl border border-landing-indigo/10 bg-white p-8 shadow-sm">
              <div className="flex items-end gap-2">
                <span className="font-mono text-5xl font-bold text-landing-text">{copy.pricing.standard.price}</span>
                <span className="mb-1 text-sm text-landing-text/60">{copy.pricing.standard.per}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-landing-text/70">{copy.pricing.standard.note}</p>
              {/* Standard card — "ابدأ الآن" leads to the existing registration
                  flow (per product spec: registration-first, no new checkout
                  path). "احجز مكانك" above stays a founding lead-form CTA. */}
              <div className="mt-6">
                <LandingButton href="/register" variant="secondary" size="lg" className="w-full">
                  ابدأ الآن
                </LandingButton>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Live slots remaining */}
        <FadeUp delay={0.15} className="mt-8 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-landing-amber/30 bg-landing-amber/10 px-5 py-2 font-semibold text-landing-text">
            {copy.pricing.slotsRemaining}{' '}
            <span className="font-mono text-lg font-bold text-landing-indigo">{remaining}</span>{' '}
            {copy.pricing.slotsSuffix}
          </p>
        </FadeUp>

        {/* Features table */}
        <FadeUp delay={0.2} className="mx-auto mt-10 max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-landing-indigo/10 bg-white shadow-sm">
            {copy.pricing.featuresTable.map((feature, i) => (
              <div
                key={feature}
                className={`flex items-center justify-between gap-3 px-6 py-3.5 text-sm ${
                  i % 2 === 0 ? 'bg-landing-bg' : 'bg-white'
                }`}
              >
                <span className="font-semibold text-landing-text">{feature}</span>
                <span className="text-landing-indigo">✓</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ────────────── Clinic Ads (carousel) ────────────── */
export function ClinicAds() {
  const copy = useLandingCopy();
  const [active, setActive] = useState(0);
  const items = copy.clinicAds.items;

  return (
    <section id="clinic-ads" className="bg-landing-dark py-20 text-white lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold sm:text-4xl">
            {copy.clinicAds.title}
          </h2>
        </FadeUp>

        <FadeUp delay={0.1} className="mx-auto mt-12 max-w-4xl">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(${active * 100}%)` }}
            >
              {items.map((ad, i) => (
                <div key={i} className="w-full shrink-0 px-2">
                  <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white p-8 text-center text-landing-text shadow-xl">
                    <span className="text-5xl">{ad.icon}</span>
                    <span className="rounded-full bg-landing-indigo/10 px-3 py-1 text-xs font-bold text-landing-indigo">
                      {ad.badge}
                    </span>
                    <h3 className="font-heading text-xl font-bold">{ad.name}</h3>
                    <p className="text-sm text-landing-text/70">{ad.offer}</p>
                    {/* TODO: connect to clinic_ads table once live content is available */}
                    <LandingButton href="#pricing" variant="secondary">
                      {copy.clinicAds.cta}
                    </LandingButton>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div className="mt-6 flex justify-center gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                aria-label={`ad ${i + 1}`}
                onClick={() => setActive(i)}
                className={`h-2.5 rounded-full transition-all ${
                  active === i ? 'w-6 bg-landing-cyan' : 'w-2.5 bg-white/30'
                }`}
              />
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ────────────── Testimonials (CMS section) ────────────── */
export function Testimonials() {
  const copy = useLandingCopy();
  const cfg = copy.testimonials as { title?: string; items?: { name: string; text: string; rating?: number }[] } | undefined;
  const items = cfg?.items ?? [];
  if (items.length === 0) return null; // hidden until the owner adds items

  return (
    <section id="testimonials" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
        {cfg?.title ?? 'آراء الأطباء'}
      </h2>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {items.map((t, i) => (
          <FadeUp key={i} delay={i * 0.05}>
            <div className="h-full rounded-[1.75rem] border border-landing-indigo/10 bg-white/70 p-6 shadow-sm">
              <div className="text-amber-400" aria-label={`${t.rating ?? 5} من 5`}>
                {'★'.repeat(Math.max(1, Math.min(5, t.rating ?? 5)))}
              </div>
              <p className="mt-3 text-sm leading-7 text-landing-text/80">“{t.text}”</p>
              <p className="mt-4 text-sm font-bold text-landing-text">{t.name}</p>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}

/* ────────────── Compare ────────────── */
export function Compare() {
  const copy = useLandingCopy();
  return (
    <section className="bg-landing-bg py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Stagger className="grid gap-6 md:grid-cols-2">
          <motion.div variants={staggerItem} className="rounded-3xl border border-slate-200 bg-slate-100 p-8">
            <h3 className="font-heading text-xl font-bold text-slate-500">😓 {copy.compare.without.title}</h3>
            <ul className="mt-6 space-y-3">
              {copy.compare.without.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-slate-500">
                  <span className="mt-0.5 text-red-400">✕</span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div variants={staggerItem} className="rounded-3xl bg-landing-dark p-8 text-white shadow-landing-btn">
            <h3 className="font-heading text-xl font-bold">✨ {copy.compare.with.title}</h3>
            <ul className="mt-6 space-y-3">
              {copy.compare.with.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-white/90">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────── FAQ (accordion) ────────────── */
export function FAQ() {
  const copy = useLandingCopy();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-landing-bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.faq.title}
          </h2>
        </FadeUp>
        <div className="mt-10 space-y-3">
          {copy.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <FadeUp key={item.q} delay={i * 0.05}>
                <div className="overflow-hidden rounded-2xl border border-landing-indigo/10 bg-white shadow-sm">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-right"
                  >
                    <span className="font-heading text-base font-bold text-landing-text">{item.q}</span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-landing-indigo/20 text-landing-indigo transition-transform ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-sm leading-7 text-landing-text/75">{item.a}</p>
                  </motion.div>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ────────────── Imaging (tabs) ────────────── */
export function Imaging() {
  const copy = useLandingCopy();
  const [tab, setTab] = useState(0);
  const healthy = [
    { label: 'الاسم', value: 'أحمد سالم' },
    { label: 'العمر', value: '34 سنة' },
    { label: 'رقم الملف', value: 'DR-0082' },
    { label: 'آخر مراجعة', value: 'اليوم' },
  ];
  return (
    <section className="bg-landing-bg py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold text-landing-text sm:text-4xl">
            {copy.imaging.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center leading-7 text-landing-text/70">
            {copy.imaging.desc}
          </p>
        </FadeUp>

        <FadeUp delay={0.1} className="mx-auto mt-12 max-w-3xl">
          {/* Tabs */}
          <div className="flex justify-center gap-2 rounded-2xl border border-landing-indigo/10 bg-white p-2 shadow-sm">
            {copy.imaging.tabs.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  tab === i ? 'bg-gradient-to-l from-landing-indigo to-landing-violet text-white' : 'text-landing-text/70'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Panel */}
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-3xl border border-landing-indigo/10 bg-white p-8 shadow-sm"
          >
            {tab === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {healthy.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-landing-indigo/10 bg-landing-bg p-4">
                    <p className="text-xs text-landing-text/60">{row.label}</p>
                    <p className="mt-1 font-semibold text-landing-text">{row.value}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === 1 && (
              <div className="flex flex-col items-center gap-3 py-10">
                <span className="text-6xl">🦷</span>
                <p className="text-sm text-landing-text/60">بانوراما رقمية — عرض كامل للأسنان</p>
              </div>
            )}
            {tab === 2 && (
              <div className="flex flex-col items-center gap-3 py-10">
                <span className="text-6xl">🧠</span>
                <p className="text-sm text-landing-text/60">طبقي CT — مقاطع ثلاثية الأبعاد</p>
              </div>
            )}
          </motion.div>
        </FadeUp>

        <Stagger className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
          {copy.imaging.features.map((feature, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="rounded-2xl border border-landing-indigo/10 bg-white p-5 text-center shadow-sm"
            >
              <span className="text-2xl">🩻</span>
              <p className="mt-2 text-sm font-semibold text-landing-text">{feature}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}