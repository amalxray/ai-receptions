'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AskChat from '@/components/ask/AskChat';
import InstallButton from '@/components/ask/InstallButton';
import WhatsAppFloat from '@/components/ask/WhatsAppFloat';
import { GoogleAnalytics } from '@next/third-parties/google';
import ShareButtons from '@/components/ask/ShareButtons';
import { Spotlight } from '@/components/ui/spotlight';
import { Meteors } from '@/components/ui/meteors';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { TextLoop } from '@/components/ui/text-loop';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BlurFade } from '@/components/ui/blur-fade';
import { ShineBorder } from '@/components/ui/shine-border';
import { Marquee } from '@/components/ui/marquee';
import { Dock, DockIcon } from '@/components/ui/dock';

/** Public origin for structured data (build-time inlined NEXT_PUBLIC_*). */
const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://www.dentairec.com';

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
  { text: 'ألم أسنان', emoji: '😖', gradient: 'linear-gradient(180deg,#cecb00 0%,#ef4949 100%)' },
  { text: 'تنظيف أسنان', emoji: '✨', gradient: 'linear-gradient(180deg,#31c300 0%,#ab7811 100%)' },
  { text: 'تقويم أسنان', emoji: '😁', gradient: 'linear-gradient(180deg,#ff1024 0%,#ffb34a 100%)' },
  { text: 'زراعة أسنان', emoji: '🦷', gradient: 'linear-gradient(180deg,#0095b7 0%,#5012ba 100%)' },
  { text: 'بانوراما', emoji: '🩻', gradient: 'linear-gradient(180deg,#c329c9 0%,#2b5dff 100%)' },
  { text: 'حالة طارئة', emoji: '🚨', gradient: 'linear-gradient(180deg,#c800ff 0%,#ff076a 51%,#ff6c6c 100%)' },
];

export default function AskClient({ settings, tips, articles, stories, faq, clinics, gallery, stats }: AskClientData) {
  const hero = (settings.hero ?? {}) as { title: string; subtitle: string; logo: string; assistant_name: string };
  const colors = (settings.colors ?? {}) as { primary?: string; secondary?: string; heading?: string; warning?: string };
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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100" dir="rtl">
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      <link rel="alternate" type="application/rss+xml" title="سنّي" href="/ask/rss.xml" />
      <link rel="manifest" href="/manifest.json" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'سنّي', url: `${SITE}/ask`, logo: `${SITE}/icons/icon-512.png`, description: 'ابحث عن أفضل طبيب أسنان قريب منك' }) }} />
      <WhatsAppFloat />

      {/* ═══ HERO (Spotlight + Meteors + ShimmerWave + TextLoop + Magnetic) ═══ */}
      <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-4 pt-10">
        <Spotlight className="-top-40 left-0 blur-2xl md:-top-24 md:left-60" fill="#10B981" />
        <Meteors number={14} />
        <div className="relative z-10 mx-auto w-full max-w-4xl text-center">
          <BlurFade>
            <div className="animate-float flex justify-center text-7xl">{hero.logo ?? '🦷'}</div>
          </BlurFade>
          <BlurFade delay={0.15}>
            <h1 className="mt-4 text-5xl font-black md:text-6xl">
              <TextShimmer duration={2.2} className='font-black'>{hero.title ?? 'كيف يمكنني مساعدتك؟'}</TextShimmer>
            </h1>
          </BlurFade>
          <BlurFade delay={0.3}>
            <p className="mt-3 text-lg text-slate-400 md:text-xl">
              اكتب لي:{' '}
              <TextLoop className="font-bold text-emerald-400">
                {loopTexts.map((q) => <span key={q}>{q}</span>)}
              </TextLoop>
            </p>
          </BlurFade>
          <BlurFade delay={0.45}>
            <div className="mt-7 flex justify-center">
              <Magnetic>
                <ShimmerButton onClick={scrollToChat} className="px-9 py-4 text-lg">🚀 ابدأ المحادثة</ShimmerButton>
              </Magnetic>
            </div>
          </BlurFade>
          <div className="mt-10 flex flex-wrap justify-center gap-8">
            {[
              { n: 12, label: 'مركز مشترك', s: '+' },
              { n: 24, label: 'ساعة خدمة', s: '/7' },
              { n: 10, label: 'مدن مغطاة', s: '+' },
            ].map((st) => (
              <div key={st.label} className="text-center">
                <div className="text-4xl font-black text-emerald-400"><NumberTicker value={st.n} />{st.s}</div>
                <div className="mt-1 text-sm text-slate-400">{st.label}</div>
              </div>
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
                <button type="button" onClick={scrollToChat} className="post-card-btn" style={{ background: q.gradient }}>
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
          <h2 className="text-center text-2xl font-black" style={{ color: colors.heading || '#7C3AED' }}>💡 نصائح مهمة</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {tips.slice(0, 3).map((t, i) => (
              <BlurFade key={String(t.id)} delay={i * 0.12} inView>
                <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-2xl">{String(t.icon ?? '💡')}</p>
                  <p className="mt-2 font-bold text-slate-100">{String(t.title)}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-400">{String(t.content)}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      {/* ═══ ARTICLES (ShineBorder) ═══ */}
      {on('articles') && published.length > 0 && (
        <section className="relative z-10 mx-auto max-w-4xl px-4 py-10">
          <h2 className="text-center text-2xl font-black" style={{ color: colors.heading || '#7C3AED' }}>📝 مقالات مفيدة</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {published.slice(0, 6).map((a, i) => (
              <BlurFade key={String(a.id)} delay={i * 0.12} inView>
                <ShineBorder borderWidth={2} duration={14} shineColor={['#10B981', '#0EA5E9', '#7C3AED']} className="h-full overflow-hidden rounded-2xl bg-slate-900">
                  <Link href={'/ask/article/' + a.slug} className="block h-full">
                    {(a.featured_image as { image_url?: string } | null)?.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(a.featured_image as { image_url?: string }).image_url!} alt={String(a.title)} loading="lazy" className="h-36 w-full object-cover transition-transform duration-500 hover:scale-105" />
                    )}
                    <div className="p-4">
                      <p className="font-bold text-slate-100">{String(a.title)}</p>
                      {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-400">{String(a.excerpt)}</p> : null}
                      <p className="mt-2 text-sm font-semibold text-emerald-400">اقرأ المزيد ←</p>
                    </div>
                  </Link>
                </ShineBorder>
              </BlurFade>
            ))}
          </div>
          <p className="mt-4 text-center text-sm"><Link href="/ask/articles" className="text-cyan-400">كل المقالات ←</Link></p>
        </section>
      )}

      {/* ═══ FUN FACTS Marquee ═══ */}
      {on('fun_facts') && (
        <div className="relative z-10 border-y border-white/10 bg-white/5 py-2">
          <Marquee pauseOnHover className="text-sm text-cyan-200" repeat={2}>
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
          <h2 className="text-center text-2xl font-black" style={{ color: colors.heading || '#7C3AED' }}>❓ أسئلة شائعة</h2>
          <div className="mt-6 space-y-2">
            {faq.map((f) => (
              <details key={String(f.id)} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-bold text-slate-100">{String(f.question)}</summary>
                <p className="mt-2 text-sm leading-6 text-slate-400">{String(f.answer)}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ═══ CTA ═══ */}
      {on('cta') && (
        <section className="relative z-10 mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl font-black text-white">جاهز تحجز موعدك؟</h2>
          <p className="mt-2 text-slate-400">اكتب مشكلتك في المحادثة، وسنوجّهك لأقرب طبيب.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <ShimmerButton onClick={scrollToChat}>💬 اسأل سنّي الآن</ShimmerButton>
            </Magnetic>
            <Link href="/discover" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-emerald-400/50">🏥 تصفح العيادات</Link>
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
