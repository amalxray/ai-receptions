'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AskChat from '@/components/ask/AskChat';
import WhatsAppFloat from '@/components/ask/WhatsAppFloat';
import { GoogleAnalytics } from '@next/third-parties/google';
import ShareButtons from '@/components/ask/ShareButtons';
import { TextLoop } from '@/components/ui/text-loop';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { BlurFade } from '@/components/ui/blur-fade';
import { Marquee } from '@/components/ui/marquee';
import { Dock, DockIcon } from '@/components/ui/dock';
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';

/** Canonical public origin for structured data — MUST stay the official domain
 *  in SSR output so crawlers never see a stale/preview host in JSON-LD. */
const SITE = PRODUCTION_BASE_URL;

import StatsSection from './StatsSection';
import ClinicsSection from './ClinicsSection';
import GallerySection from './GallerySection';
import TestimonialsSection from './TestimonialsSection';
import AskFooter from './AskFooter';

export type AskClientData = {
  settings: Record<string, unknown>;
  tips: Array<Record<string, unknown>>;
  articles: Array<Record<string, unknown>>;
  stories: Array<Record<string, unknown>>;
  faq: Array<Record<string, unknown>>;
  clinics: Array<Record<string, unknown>>;
  gallery: Array<Record<string, unknown>>;
  stats: { clinics_count: number; patients_count: number; cities_count: number };
};

const QUICK_CARDS = [
  { text: 'ألم أسنان', emoji: '😖' },
  { text: 'تنظيف أسنان', emoji: '✨' },
  { text: 'تقويم أسنان', emoji: '😁' },
  { text: 'زراعة أسنان', emoji: '🦷' },
  { text: 'بانوراما', emoji: '🩻' },
  { text: 'حالة طارئة', emoji: '🚨' },
];

export default function AskClient({ settings, tips, articles, stories, faq, clinics, gallery, stats }: AskClientData) {
  const hero = (settings.hero ?? {}) as { title: string; subtitle: string; logo: string; assistant_name: string };
  const sections = (settings.sections ?? {}) as Record<string, boolean>;
  const questions = (settings.questions ?? []) as string[];
  const on = (k: string) => sections[k] !== false;
  const published = articles.filter((a) => a.slug);
  const chatRef = useRef<HTMLDivElement>(null);
  const scrollToChat = () => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const funFacts = tips.filter((t) => t.category === 'fun_fact');
  const loopTexts = questions.length > 0 ? questions : ['طاحونتي بتوجعني', 'بدي احجز موعد', 'بدي تنظيف أسنان'];
  const featuredTip = tips[0];

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/30 text-slate-800" dir="rtl" style={{ colorScheme: 'light' }}>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      <link rel="alternate" type="application/rss+xml" title="سنّي" href="/ask/rss.xml" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'سنّي', url: `${SITE}/ask`, logo: `${SITE}/icons/icon-512.png`, description: 'ابحث عن أفضل طبيب أسنان قريب منك' }) }} />
      <WhatsAppFloat />

      {/* ═══ HERO ═══ */}
      <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-4 pt-10">
        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <BlurFade>
            <div className="animate-float flex justify-center text-5xl sm:text-6xl">{hero.logo ?? '🦷'}</div>
          </BlurFade>
          <BlurFade delay={0.15}>
            <h1 className="mt-4 text-3xl font-black leading-tight text-slate-900 sm:text-4xl md:text-5xl">
              لا تنتظر على الهاتف.. احجز موعدك الذكي في 30 ثانية
            </h1>
          </BlurFade>
          <BlurFade delay={0.3}>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-600 md:text-xl">
              مساعدك الذكي «سنّي» متاح الآن 24/7 للإجابة عن أسئلتك، وتوجيهك لأقرب عيادة، وتأكيد حجزك فورًا بكل سهولة.
              {' '}ابدأ بسؤالك: <TextLoop className="font-bold text-blue-700">
                {loopTexts.map((q) => <span key={q}>{q}</span>)}
              </TextLoop>
            </p>
          </BlurFade>
          <BlurFade delay={0.45}>
            <div className="mt-7 flex justify-center">
              <Magnetic>
                <ShimmerButton onClick={scrollToChat} className="bg-blue-600 px-9 py-4 text-lg hover:bg-blue-700" style={{ background: '#2563eb' }}>ابدأ الدردشة واحجز الآن 🚀</ShimmerButton>
              </Magnetic>
            </div>
          </BlurFade>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-slate-600">
            {['بدون تسجيل', 'رد فوري', 'بياناتك مشفرة'].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <span className="font-bold text-emerald-600" aria-hidden>✓</span>{item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STATS (dynamic from DB) ═══ */}
      <StatsSection stats={stats} />

      {/* ═══ CHAT + QUICK CARDS ═══ */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-10">
        {on('quick_questions') && questions.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {QUICK_CARDS.map((q, i) => (
              <BlurFade key={q.text} delay={i * 0.08} inView>
                <button type="button" onClick={scrollToChat} className="post-card-btn">
                  <span className="text-3xl">{q.emoji}</span>
                  <span className="text-xs font-bold">{q.text}</span>
                </button>
              </BlurFade>
            ))}
          </div>
        )}
        <div ref={chatRef}>
          <AskChat assistantName={hero.assistant_name ?? 'سنّي'} logo={hero.logo ?? '🦷'} quickQuestions={questions} />
        </div>
      </section>

      {/* ═══ PARTNER CLINICS (Doctor Cards) ═══ */}
      <ClinicsSection clinics={clinics as never} />

      {/* ═══ GALLERY ═══ */}
      <GallerySection images={gallery} />

      {/* ═══ TESTIMONIALS (Marquee) ═══ */}
      <TestimonialsSection testimonials={stories} />

      {/* ═══ TIPS ═══ */}
      {on('tips') && tips.length > 0 && (
        <section className="relative z-10 mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center text-2xl font-black text-blue-800">💡 إرشادات تساعدك على العناية بابتسامتك</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {tips.slice(0, 3).map((t, i) => (
              <BlurFade key={String(t.id)} delay={i * 0.12} inView>
                <div className="h-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md">
                  <p className="text-2xl">{String(t.icon ?? '💡')}</p>
                  <p className="mt-2 font-bold text-slate-800">{String(t.title)}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-600">{String(t.content)}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      {/* ═══ ARTICLES (ShineBorder) ═══ */}
      {on('articles') && published.length > 0 && (
        <section className="relative z-10 mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center text-2xl font-black text-blue-800">📝 معلومات موثوقة لصحة فمك</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {published.slice(0, 6).map((a, i) => (
              <BlurFade key={String(a.id)} delay={i * 0.12} inView>
                <div className="h-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:shadow-blue-900/5">
                  <Link href={'/ask/article/' + a.slug} className="block h-full">
                    {(String(a.featured_image_url ?? '') || (a.featured_image as { image_url?: string } | null)?.image_url) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(a.featured_image_url ?? (a.featured_image as { image_url?: string } | null)?.image_url)} alt={String(a.title)} loading="lazy" className="h-36 w-full object-cover transition-transform duration-300 ease-out hover:scale-[1.03]" />
                    )}
                    <div className="p-4">
                      <p className="font-bold text-slate-800">{String(a.title)}</p>
                      {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{String(a.excerpt)}</p> : null}
                      <p className="mt-2 text-sm font-semibold text-blue-700">اكتشف النصائح ←</p>
                    </div>
                  </Link>
                </div>
              </BlurFade>
            ))}
          </div>
          <p className="mt-4 text-center text-sm"><Link href="/ask/articles" className="font-semibold text-blue-700 hover:text-blue-800">اكتشف كل المقالات ←</Link></p>
        </section>
      )}

      {/* ═══ FUN FACTS Marquee ═══ */}
      {on('fun_facts') && (
        <div className="relative z-10 border-y border-blue-100 bg-blue-50/70 py-2">
          <Marquee pauseOnHover className="text-sm text-blue-800" repeat={2}>
            {(funFacts.length > 0
              ? funFacts.map((t) => ({ id: String(t.id), icon: String(t.icon ?? '✨'), text: String(t.title) }))
              : [
                  { id: 'f1', icon: '🦷', text: 'الأسنان أقوى من العظام' },
                  { id: 'f2', icon: '💧', text: 'اللعاب يقتل البكتيريا' },
                  { id: 'f3', icon: '🔍', text: 'بصمة أسنانك فريدة كالبصمة' },
                  { id: 'f4', icon: '⏰', text: 'افحص أسنانك كل ٦ أشهر' },
                  { id: 'f5', icon: '🍎', text: 'التفاح ينظف الأسنان' },
                  { id: 'f6', icon: '❄️', text: 'الماء البارد يخفف الألم' },
                ]
            ).map((f) => (
              <span key={f.id} className="mx-8">{f.icon} {f.text}</span>
            ))}
          </Marquee>
        </div>
      )}

      {/* ═══ FAQ ═══ */}
      {on('faq') && faq.length > 0 && (
        <section className="relative z-10 mx-auto max-w-3xl px-4 py-10">
          <h2 className="text-center text-2xl font-black text-blue-800">❓ إجابات على أسئلتك</h2>
          <div className="mt-6 space-y-2">
            {faq.map((f) => (
              <details key={String(f.id)} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-bold text-slate-800">{String(f.question)}</summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">{String(f.answer)}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ═══ CTA ═══ */}
      {on('cta') && (
        <section className="relative z-10 mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl font-black text-slate-900">دع سنّي يساعدك الآن.. ابدأ المحادثة</h2>
          <p className="mt-2 text-slate-600">شاركنا ما تحتاجه، وسنرشدك إلى العيادة المناسبة وخطوة الحجز التالية.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <ShimmerButton onClick={scrollToChat} className="bg-blue-600 hover:bg-blue-700" style={{ background: '#2563eb' }}>ابدأ الدردشة واحجز الآن 🚀</ShimmerButton>
            </Magnetic>
            <Link href="/discover" className="rounded-full border border-blue-200 bg-white px-6 py-3 text-sm font-semibold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50">🏥 اعثر على عيادة قريبة</Link>
          </div>
        </section>
      )}

      <AskFooter />

      {/* ═══ SOCIAL DOCK ═══ */}
      <Dock className="hidden md:flex">
        <DockIcon><a href="https://wa.me/970569509093" target="_blank" rel="noopener noreferrer" aria-label="واتساب">💬</a></DockIcon>
        <DockIcon><a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="فيسبوك">📘</a></DockIcon>
        <DockIcon><a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="انستغرام">📸</a></DockIcon>
        <DockIcon><Link href="/ask/qr" aria-label="QR">📱</Link></DockIcon>
        <DockIcon><Link href="/" aria-label="الرئيسية">🏠</Link></DockIcon>
      </Dock>

      <style>{`@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(50%)}}`}</style>
    </main>
  );
}
