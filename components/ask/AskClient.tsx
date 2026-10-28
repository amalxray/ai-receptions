'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AskChat from '@/components/ask/AskChat';
import { GoogleAnalytics } from '@next/third-parties/google';
import { TextLoop } from '@/components/ui/text-loop';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { BlurFade } from '@/components/ui/blur-fade';
import { Marquee } from '@/components/ui/marquee';
import { Dock, DockIcon } from '@/components/ui/dock';
import { LetterReveal } from '@/components/landing/motion';
import { PRODUCTION_BASE_URL } from '@/lib/communications/links';
import { AskBackground } from '@/components/ask/AskBackground';
import { AlertCircle, Sparkles, Smile, PlusCircle, AlertTriangle, Camera } from 'lucide-react';

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
  { text: 'ألم أسنان', icon: AlertCircle },
  { text: 'تنظيف أسنان', icon: Sparkles },
  { text: 'تقويم أسنان', icon: Smile },
  { text: 'زراعة أسنان', icon: PlusCircle },
  { text: 'بانوراما', icon: Camera },
  { text: 'حالة طارئة', icon: AlertTriangle },
];

const DEFAULT_ASK_SECTION_ORDER = [
  'hero', 'stats', 'quick_questions', 'clinics', 'gallery', 'stories',
  'tips', 'articles', 'fun_facts', 'faq', 'cta',
];

export default function AskClient({ settings, tips, articles, stories, faq, clinics, gallery, stats }: AskClientData) {
  const hero = (settings.hero ?? {}) as { title: string; subtitle: string; logo: string; assistant_name: string };
  const sections = (settings.sections ?? {}) as Record<string, boolean>;
  const questions = (settings.questions ?? []) as string[];
  const storedOrder = Array.isArray(settings.sections_order)
    ? settings.sections_order.filter((key): key is string => typeof key === 'string' && DEFAULT_ASK_SECTION_ORDER.includes(key))
    : [];
  const sectionOrder = Array.from(new Set([...storedOrder, ...DEFAULT_ASK_SECTION_ORDER]));
  const sectionPosition = (key: string) => sectionOrder.indexOf(key);
  const on = (k: string) => sections[k] !== false;
  const published = articles.filter((a) => a.slug);
  const chatRef = useRef<HTMLDivElement>(null);
  const scrollToChat = () => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const funFacts = tips.filter((t) => t.category === 'fun_fact');
  const loopTexts = questions.length > 0 ? questions : ['طاحونتي بتوجعني', 'بدي احجز موعد', 'بدي تنظيف أسنان'];
  const featuredTip = tips[0];

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/30 text-slate-800" dir="rtl" style={{ colorScheme: 'light' }}>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      <link rel="alternate" type="application/rss+xml" title="سنّي" href="/ask/rss.xml" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'سنّي', url: `${SITE}/ask`, logo: `${SITE}/icons/icon-512.png`, description: 'ابحث عن أفضل طبيب أسنان قريب منك' }) }} />
      {/* ═══ HERO ═══ */}
      <section style={{ order: sectionPosition('hero') }} className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-4 pt-10">
        {/* Animated AI Background */}
        <AskBackground />
        {/* Animated playful background blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-16 right-10 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-400/30 to-violet-400/30 blur-3xl animate-blob-drift" />
          <div className="absolute top-32 -left-10 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-300/30 to-blue-400/30 blur-3xl animate-float-slower" />
          <div className="absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-gradient-to-br from-violet-300/25 to-indigo-300/25 blur-3xl animate-float-slow" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <BlurFade>
            <div className="flex justify-center">
              <div className="relative animate-float">
                <svg width="120" height="120" viewBox="0 0 120 120" className="drop-shadow-[0_0_60px_rgba(99,102,241,0.6)]">
                  <defs>
                    <linearGradient id="tooth3d" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#e0e7ff" />
                      <stop offset="100%" stopColor="#c7d2fe" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <g filter="url(#glow)">
                    <path d="M60 20 C70 20, 85 25, 85 40 C85 55, 75 70, 60 90 C45 70, 35 55, 35 40 C35 25, 50 20, 60 20 Z" 
                          fill="url(#tooth3d)" stroke="#6366f1" strokeWidth="2" opacity="0.95"/>
                    <path d="M60 25 C68 25, 78 29, 78 40 C78 52, 70 65, 60 83 C50 65, 42 52, 42 40 C42 29, 52 25, 60 25 Z" 
                          fill="none" stroke="#a5b4fc" strokeWidth="1.5" opacity="0.7"/>
                    <circle cx="55" cy="35" r="2" fill="#6366f1" opacity="0.6"/>
                    <circle cx="65" cy="32" r="1.5" fill="#6366f1" opacity="0.6"/>
                  </g>
                </svg>
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 rounded-full blur-xl animate-pulse"></div>
              </div>
            </div>
          </BlurFade>
          <BlurFade delay={0.15}>
            <h1 className="mt-6 text-3xl font-black leading-tight text-slate-900 sm:text-4xl md:text-5xl">
              <LetterReveal text="لا تنتظر على الهاتف.. احجز موعدك الذكي في 30 ثانية" />
            </h1>
          </BlurFade>
          <BlurFade delay={0.3}>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-600 md:text-xl">
              مساعدك الذكي «سنّي» متاح الآن 24/7 للإجابة عن أسئلتك، وتوجيهك لأقرب عيادة، وتأكيد حجزك فورًا بكل سهولة.
              {' '}ابدأ بسؤالك: <TextLoop className="font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-transparent">
                {loopTexts.map((q) => <span key={q}>{q}</span>)}
              </TextLoop>
            </p>
          </BlurFade>
          <BlurFade delay={0.45}>
            <div className="mt-7 flex justify-center">
              <Magnetic>
                <div className="rounded-xl shadow-[0_0_40px_rgba(99,102,241,0.6)] animate-[glow-pulse_2s_ease-in-out_infinite]">
                  <ShimmerButton onClick={scrollToChat} className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 px-9 py-4 text-lg hover:scale-105 transition-transform" style={{ background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #06b6d4)' }}>ابدأ الدردشة واحجز الآن 🚀</ShimmerButton>
                </div>
              </Magnetic>
            </div>
          </BlurFade>
          <BlurFade delay={0.6}>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {[
                { icon: '✓', text: 'بدون تسجيل', color: 'emerald' },
                { icon: '⚡', text: 'رد فوري', color: 'cyan' },
                { icon: '🔒', text: 'بياناتك مشفرة', color: 'indigo' }
              ].map((item) => (
                <div key={item.text} className="backdrop-blur-md bg-white/60 border border-white/40 rounded-full px-4 py-2 shadow-lg">
                  <span className={`font-bold text-${item.color}-600`} aria-hidden>{item.icon}</span>
                  <span className="mr-1.5 text-sm font-medium text-slate-700">{item.text}</span>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ═══ TICKER - News bar at top ═══ */}
      {on('fun_facts') && (
        <div className="relative z-20 border-y border-indigo-200/50 bg-gradient-to-r from-indigo-50/90 via-white/90 to-cyan-50/90 backdrop-blur-md py-1.5 shadow-sm">
          <Marquee pauseOnHover className="text-xs font-medium text-indigo-800" repeat={2}>
            {(funFacts.length > 0
              ? funFacts.map((t) => ({ id: String(t.id), slug: t.slug, text: String(t.title) }))
              : [
                  { id: 'f1', slug: null, text: 'الأسنان أقوى من العظام' },
                  { id: 'f2', slug: null, text: 'اللعاب يقتل البكتيريا' },
                  { id: 'f3', slug: null, text: 'بصمة أسنانك فريدة كالبصمة' },
                  { id: 'f4', slug: null, text: 'افحص أسنانك كل ٦ أشهر' },
                  { id: 'f5', slug: null, text: 'التفاح ينظف الأسنان' },
                  { id: 'f6', slug: null, text: 'الماء البارد يخفف الألم' },
                ]
            ).map((f) => (
              <Link key={f.id} href={f.slug ? `/ask/article/${f.slug}` : '/ask/articles'} className="mx-8 hover:text-indigo-600 transition-colors cursor-pointer">✨ {f.text}</Link>
            ))}
          </Marquee>
        </div>
      )}

      {/* ═══ STATS (dynamic from DB) ═══ */}
      {on('stats') && <div style={{ order: sectionPosition('stats') }}><StatsSection stats={stats} /></div>}

      {/* ═══ CHAT + QUICK CARDS ═══ */}
      <section style={{ order: sectionPosition('quick_questions') }} className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-10">
        {on('quick_questions') && questions.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {QUICK_CARDS.map((q, i) => {
              const Icon = q.icon;
              return (
              <BlurFade key={q.text} delay={i * 0.08} inView>
                <button type="button" onClick={scrollToChat} className="backdrop-blur-md bg-white/70 border border-white/60 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">{q.text}</span>
                </button>
              </BlurFade>
              );
            })}
          </div>
        )}
        <div ref={chatRef}>
          <AskChat assistantName={hero.assistant_name ?? 'سنّي'} logo={hero.logo ?? '🦷'} quickQuestions={questions} />
        </div>
      </section>

      {/* ═══ PARTNER CLINICS (Doctor Cards) ═══ */}
      {on('clinics') && <div style={{ order: sectionPosition('clinics') }}><ClinicsSection clinics={clinics as never} /></div>}

      {/* ═══ GALLERY ═══ */}
      {on('gallery') && <div style={{ order: sectionPosition('gallery') }}><GallerySection images={gallery} /></div>}

      {/* ═══ TESTIMONIALS (Marquee) ═══ */}
      {on('stories') && <div style={{ order: sectionPosition('stories') }}><TestimonialsSection testimonials={stories} /></div>}

      {/* ═══ TIPS ═══ */}
      {on('tips') && tips.length > 0 && (
        <section style={{ order: sectionPosition('tips') }} className="relative z-10 mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center text-2xl font-black text-blue-800">💡 إرشادات تساعدك على العناية بابتسامتك</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {tips.slice(0, 3).map((t, i) => (
              <BlurFade key={String(t.id)} delay={i * 0.12} inView>
                <div className="group h-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow hover:border-blue-200" style={{ animation: `float 3.2s ease-in-out infinite`, animationDelay: `${i * 0.4}s` }}>
                  <p className="inline-block text-2xl transition-transform duration-300 group-hover:scale-125 group-hover:animate-bounce">{String(t.icon ?? '💡')}</p>
                  <p className="mt-2 font-bold text-slate-800 transition-colors group-hover:text-blue-700">{String(t.title)}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-600">{String(t.content)}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      {/* ═══ ARTICLES (ShineBorder) ═══ */}
      {on('articles') && published.length > 0 && (
        <section style={{ order: sectionPosition('articles') }} className="relative z-10 mx-auto max-w-4xl px-4 py-10">
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

      {/* ═══ FUN FACTS Marquee - Moved to bottom area ═══ */}

      {/* ═══ FAQ ═══ */}
      {on('faq') && faq.length > 0 && (
        <section style={{ order: sectionPosition('faq') }} className="relative z-10 mx-auto max-w-3xl px-4 py-10">
          <h2 className="text-center text-2xl font-black text-blue-800">❓ إجابات على أسئلتك</h2>
          <div className="mt-6 space-y-2">
            {faq.map((f) => (
              <details key={String(f.id)} className="group rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors duration-300 open:bg-blue-50/40 hover:border-blue-200 hover:bg-blue-50/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-800">
                  {String(f.question)}
                  <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700 transition-transform duration-300 ease-out group-open:rotate-180">▾</span>
                </summary>
                <p className="mt-2 animate-fade-in text-sm leading-6 text-slate-600">{String(f.answer)}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ═══ CTA ═══ */}
      {on('cta') && (
        <section style={{ order: sectionPosition('cta') }} className="relative z-10 mx-auto max-w-3xl px-4 py-14 text-center">
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

      <div style={{ order: sectionOrder.length }}><AskFooter /></div>

      {/* ═══ SOCIAL DOCK ═══ */}
      <Dock className="hidden md:flex">
        <DockIcon><a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="فيسبوك">📘</a></DockIcon>
        <DockIcon><a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="انستغرام">📸</a></DockIcon>
        <DockIcon><Link href="/ask/qr" aria-label="QR">📱</Link></DockIcon>
        <DockIcon><Link href="/" aria-label="الرئيسية">🏠</Link></DockIcon>
      </Dock>

      <style>{`@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(50%)}}`}</style>
    </main>
  );
}
