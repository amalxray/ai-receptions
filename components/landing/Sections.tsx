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
                {copy.pricing.advanced.badge}
              </span>
              <div className="mt-8 flex items-end gap-2">
                <span className="font-mono text-5xl font-bold text-landing-text">{copy.pricing.advanced.price}</span>
                <span className="mb-1 text-sm text-landing-text/60">{copy.pricing.advanced.per}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-landing-indigo">{copy.pricing.advanced.note}</p>
              <div className="mt-6">
                <LandingButton href="/register?plan=advanced" size="lg" className="w-full">
                  اشترك الآن
                </LandingButton>
              </div>
            </div>
          </FadeUp>

          {/* Standard card */}
          <FadeUp delay={0.1}>
            <div className="rounded-3xl border border-landing-indigo/10 bg-white p-8 shadow-sm">
              <div className="flex items-end gap-2">
                <span className="font-mono text-5xl font-bold text-landing-text">{copy.pricing.basic.price}</span>
                <span className="mb-1 text-sm text-landing-text/60">{copy.pricing.basic.per}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-landing-text/70">{copy.pricing.basic.note}</p>
              <p className="mt-3 text-xs font-semibold text-landing-indigo">{copy.pricing.yearlyNote}</p>
              <p className="mt-1 text-xs font-semibold text-landing-text/70">{copy.pricing.trialNote}</p>
              {/* Standard card — leads to the existing registration flow */}
              <div className="mt-6">
                <LandingButton href="/register?plan=basic" variant="secondary" size="lg" className="w-full">
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

/* ────────────── Clinic Ads (LIVE) ────────────── */
export function ClinicAds() {
  const copy = useLandingCopy();
  const [ads, setAds] = useState<Array<{ id: string; title: string; description: string | null; image_url: string | null; cta_text: string; cta_link: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/booking/ads?limit=3');
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'تعذّر تحميل الإعلانات');
        if (!cancelled) setAds(body.data?.ads ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذّر تحميل الإعلانات');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <section id="clinic-ads" className="relative isolate overflow-hidden bg-[#FAFBFC] py-16 lg:py-20"><div className="mx-auto max-w-6xl px-4 animate-pulse"><div className="h-64 rounded-3xl bg-slate-200" /></div></section>;
  }

  if (error || ads.length === 0) return null;

  return (
    <section id="clinic-ads" className="relative isolate overflow-hidden bg-[#FAFBFC] py-20 lg:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-0 -z-10 h-72 w-72 rounded-full bg-[#8B5CF6]/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 -z-10 h-72 w-72 rounded-full bg-[#0EA5E9]/10 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <h2 className="text-center font-heading text-3xl font-extrabold sm:text-4xl">{copy.clinicAds.title}</h2>
        </FadeUp>
        <FadeUp delay={0.1} className="mx-auto mt-12 max-w-4xl">
          <div className="grid gap-6 md:grid-cols-3">
            {ads.map((ad) => (
              <div key={ad.id} className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-0 text-center text-landing-text shadow-sm transition hover:shadow-lg">
                <div className="flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200">
                  {ad.image_url ? <img src={ad.image_url} alt={ad.title} className="h-full w-full object-cover" loading="lazy" /> : <span className="text-5xl">📢</span>}
                </div>
                <div className="p-8">
                  <h3 className="font-heading text-xl font-bold">{ad.title}</h3>
                  {ad.description && <p className="mt-3 text-sm text-landing-text/70">{ad.description}</p>}
                  {ad.cta_link && <a href={ad.cta_link} className="mt-5 inline-flex items-center gap-2 rounded-full bg-landing-indigo px-4 py-2 text-sm font-bold text-white">{ad.cta_text || copy.clinicAds.cta}</a>}
                </div>
              </div>
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

/* ────────────── Imaging (tabs + patient-file hotspots) ────────────── */
const PATIENT_FILE_HOTSPOTS = [
  { id: 'dicom', x: '24%', y: '62%', title: 'صورة أشعة DICOM', description: 'بانوراما ومقاطع CT حتى 2 جيجابايت — مرفوعة من مركز التصوير مباشرة إلى ملف المريض.' },
  { id: 'report', x: '52%', y: '38%', title: 'تقرير طبي', description: 'تشخيص الطبيب وخطة العلاج مرفقة بالملف — واضحة قبل دخول المريض.' },
  { id: 'tooth', x: '76%', y: '66%', title: 'تفاصيل السن', description: 'حالة كل سن، العلاجات السابقة، والملاحظات السريرية في مكان واحد.' },
];

function DentalXrayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto h-7 w-7 text-landing-indigo"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M8 7.5c2-2.2 4.6-2 8-.7 3.4-1.3 6-1.5 8 .7 1.7 1.9 1.1 5.1-.1 8.5-.9 2.7-1.7 7-3.5 7-1.5 0-1.1-7.3-4.4-7.3s-2.9 7.3-4.4 7.3c-1.8 0-2.6-4.3-3.5-7C6.9 12.6 6.3 9.4 8 7.5Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m4.3 8.2 1.9.9M3.7 14h2M25.8 9.1l1.9-.9m-1.3 5.8h2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function Imaging() {
  const copy = useLandingCopy();
  const [tab, setTab] = useState(0);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(PATIENT_FILE_HOTSPOTS[0].id);
  const activeHotspot = PATIENT_FILE_HOTSPOTS.find((spot) => spot.id === activeHotspotId);
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
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {healthy.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-landing-indigo/10 bg-landing-bg p-4">
                      <p className="text-xs text-landing-text/60">{row.label}</p>
                      <p className="mt-1 font-semibold text-landing-text">{row.value}</p>
                    </div>
                  ))}
                </div>
                {/* Patient-file interactive hotspots — pattern from ui-lab ImageMotionShowcase (IMAGE HOTSPOTS) */}
                <div dir="rtl" className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-landing-indigo/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 sm:aspect-[16/8]" aria-label="معاينة ملف المريض التفاعلية">
                  <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(34,211,238,0.18),transparent_45%),radial-gradient(circle_at_75%_70%,rgba(139,92,246,0.18),transparent_45%)]" />
                  <div aria-hidden="true" className="absolute inset-x-6 top-5 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
                    <p className="text-xs font-bold text-white">ملف المريض — أحمد سالم (DR-0082)</p>
                    <p className="mt-1 text-[11px] text-white/70">بانوراما رقمية + تقرير + خطة علاج</p>
                  </div>
                  {PATIENT_FILE_HOTSPOTS.map((spot) => {
                    const isActive = activeHotspotId === spot.id;
                    return (
                      <button
                        key={spot.id}
                        type="button"
                        onClick={() => setActiveHotspotId(isActive ? null : spot.id)}
                        aria-label={spot.title}
                        aria-expanded={isActive}
                        className={`absolute z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-slate-950 transition hover:scale-110 ${isActive ? 'border-white bg-white shadow-[0_0_28px_rgba(255,255,255,0.55)]' : 'border-white/70 bg-cyan-300/90 shadow-[0_0_28px_rgba(103,232,249,0.55)]'}`}
                        style={{ left: spot.x, top: spot.y }}
                      >
                        <span className="absolute inset-0 animate-ping rounded-full bg-cyan-200/40" />
                        <span className="relative text-lg leading-none">+</span>
                      </button>
                    );
                  })}
                  {activeHotspot && (
                    <motion.div
                      key={activeHotspot.id}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-white/20 bg-slate-950/85 p-3 text-right shadow-xl backdrop-blur-xl sm:bottom-4 sm:left-4 sm:right-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-bold text-white">{activeHotspot.title}</h4>
                          <p className="mt-1 text-[11px] leading-5 text-slate-300">{activeHotspot.description}</p>
                        </div>
                        <button type="button" aria-label="إغلاق المعلومة" onClick={() => setActiveHotspotId(null)} className="rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white">✕</button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </>
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
              <DentalXrayIcon />
              <p className="mt-2 text-sm font-semibold text-landing-text">{feature}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
