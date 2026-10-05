'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useLandingCopy } from '@/components/landing/LandingContent';
import { Particles } from '@/components/ui/particles';
import { Meteors } from '@/components/ui/meteors';
import { TextReveal } from '@/components/ui/text-reveal';
import { Magnetic } from '@/components/ui/magnetic';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { landingCopy } from '@/lib/landing/landing-copy';

export type HeroContent = {
  headline1: string;
  headline2: string;
  paragraph: string;
  description: string;
  ctaPrimary: string;
  ctaPrimaryHref: string;
  ctaSecondary: string;
  ctaSecondaryHref: string;
  stats: Array<{ value: string; label: string }>;
};


type ChatStep =
  | { type: 'ai'; text: string }
  | { type: 'patient'; text: string }
  | { type: 'ai-buttons' }
  | { type: 'confirm' }
  | { type: 'reminder' };

const script: ChatStep[] = [
  { type: 'ai', text: 'أهلًا فيك، كيف بقدر أساعدك؟' },
  { type: 'patient', text: 'طاحونتي بتوجعني من مبارح.' },
  { type: 'ai', text: 'سلامتك 🙏 الألم بيزيد مع البارد ولا مستمر طول الوقت؟' },
  { type: 'patient', text: 'الألم مستمر' },
  { type: 'ai', text: 'تمام. حسب موقعك، أقرب عيادة إلك هي عيادة الدكتورة حلا. بدك أفحصلك أقرب موعد متوفر؟' },
  { type: 'patient', text: 'نعم' },
  { type: 'ai', text: 'يوجد موعد اليوم الساعة 2:30، وموعد الساعة 4:20 مساءً. أنهي بتناسبك؟' },
  { type: 'patient', text: 'الساعة 4:20' },
  { type: 'ai', text: 'ممتاز، بس محتاج أكمّل تسجيلك — شو اسمك ورقم هاتفك؟' },
  { type: 'patient', text: 'اسمي أحمد سالم، 059-123-4567' },
  { type: 'ai', text: 'تمام يا أحمد، بأكدلك الحجز عند د. حلا الساعة 4:20 مساءً؟' },
  { type: 'ai-buttons' },
  { type: 'patient', text: 'تأكيد الحجز ✓' },
  { type: 'confirm' },
  { type: 'reminder' },
];

const TYPING_MS = 1500;
const GAP_MS = 1300;
const CONFIRM_DELAY_MS = 1500;
const LOOP_DELAY_MS = 6000;

export default function Hero({ content }: { content?: Partial<HeroContent> }) {
  const copy = useLandingCopy();
  const heroContent: HeroContent = {
    ...landingCopy.hero,
    ...copy.hero,
    ...content,
    stats: content?.stats ?? copy.hero?.stats ?? landingCopy.hero.stats,
  };
  const paragraphHighlightIndex = heroContent.paragraph.indexOf('مريض');
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const blobY = useTransform(scrollYProgress, [0, 1], [48, -48]);
  const [showTyping, setShowTyping] = useState(false);
  const [messages, setMessages] = useState<ChatStep[]>([]);

  useEffect(() => {
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t4: ReturnType<typeof setTimeout>;

    function playLoop() {
      setMessages([]);
      const playNext = (i: number) => {
        if (cancelled) return;
        if (i >= script.length) {
          t4 = setTimeout(playLoop, LOOP_DELAY_MS);
          return;
        }
        const step = script[i];
        if (step.type === 'ai-buttons') {
          setMessages((prev) => [...prev, step]);
          t1 = setTimeout(() => {
            setTimeout(() => playNext(i + 2), CONFIRM_DELAY_MS);
          }, 800);
          return;
        }
        setShowTyping(step.type === 'ai' || step.type === 'confirm' || step.type === 'reminder');
        t1 = setTimeout(() => {
          setShowTyping(false);
          setMessages((prev) => [...prev, step]);
          t2 = setTimeout(() => playNext(i + 1), GAP_MS);
        }, step.type === 'ai' || step.type === 'confirm' || step.type === 'reminder' ? TYPING_MS : 400);
      };
      playNext(0);
    }

    t1 = setTimeout(playLoop, 600);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t4);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#FAFBFC] pt-36 pb-24 lg:pt-44 lg:pb-32">
      {/* Ambient: particles + meteors + glows */}
      <Particles className="absolute inset-0 -z-20" quantity={90} color="#818CF8" size={2.2} ease={35} />
      <Meteors number={16} />
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <motion.div style={{ y: blobY }} animate={{ x: [0, 24, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} className="absolute -left-24 top-4 h-96 w-96 rounded-full bg-[#8B5CF6]/20 blur-[110px]" />
        <motion.div style={{ y: blobY }} animate={{ x: [0, -24, 0] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} className="absolute right-0 top-32 h-96 w-96 rounded-full bg-[#22D3EE]/25 blur-[100px]" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-violet-950/80 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2 lg:px-8">
        {/* ── Copy (RTL) ── */}
        <div className="text-center lg:text-right">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-800"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <TextShimmer duration={2.4} className="text-xs font-semibold text-slate-700">موظفة استقبال ذكية — ترد وتحجز 24/7</TextShimmer>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-4xl font-black leading-[1.25] text-slate-950 md:text-5xl lg:text-[3.4rem]">
            <TextReveal text={heroContent.headline1} duration={0.7} delay={0.2} />
            <br />
            <span className="bg-gradient-to-l from-[var(--landing-primary)] to-[var(--landing-secondary)] bg-clip-text text-transparent">
              <TextReveal text={heroContent.headline2} duration={0.7} delay={0.9} />
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.6 }} className="mx-auto mt-4 max-w-xl text-xl font-semibold leading-8 text-slate-700 lg:mx-0">
            {paragraphHighlightIndex < 0 ? heroContent.paragraph : <>
              {heroContent.paragraph.slice(0, paragraphHighlightIndex)}
              <span className="font-black text-[#EF4444]">مريض</span>
              {heroContent.paragraph.slice(paragraphHighlightIndex + 'مريض'.length)}
            </>}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="mx-auto mt-5 max-w-lg text-lg leading-8 text-slate-600 lg:mx-0"
          >
            {heroContent.description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.5 }}
            className="mt-9 flex flex-wrap justify-center gap-4 lg:justify-start"
          >
            <Magnetic>
              <Link href={heroContent.ctaPrimaryHref}>
                <ShimmerButton style={{ background: 'linear-gradient(135deg, var(--landing-primary) 0%, var(--landing-secondary) 100%)' }} className="animate-pulse px-8 py-4 text-lg font-bold shadow-[0_0_24px_rgba(139,92,246,0.32)] hover:shadow-[0_0_36px_rgba(34,211,238,0.55)] transition-all duration-300">{heroContent.ctaPrimary}</ShimmerButton>
              </Link>
            </Magnetic>
            <a
              href={heroContent.ctaSecondaryHref}
              className="rounded-full border border-slate-300 px-8 py-4 text-lg font-semibold text-slate-700 transition-all duration-300 hover:border-violet-400/60 hover:bg-violet-50 hover:shadow-lg hover:shadow-violet-500/10"
              style={{ borderColor: 'var(--landing-primary)' }}
            >
              {heroContent.ctaSecondary}
            </a>
          </motion.div>

          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-600 lg:justify-start">
            {['بدون بطاقة', '5 دقائق', 'إلغاء حر'].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5"><span className="text-emerald-600">✓</span>{item}</span>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
            {heroContent.stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2 + i * 0.15, duration: 0.5 }}
                className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm"
              >
                <div className="text-2xl font-black text-slate-900 md:text-3xl">
                  {/^[0-9]/.test(s.value) ? <NumberTicker value={parseInt(s.value, 10) || 0} /> : s.value}
                  {s.value === '24/7' ? '/7' : s.value.includes('%') ? '%' : s.value === '<3s' ? 's' : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Animated chat demo (dark phone) ── */}
        <motion.div
          initial={{ opacity: 0, y: 40, rotateY: 12 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-violet-600/40 via-blue-500/30 to-emerald-500/40 blur-2xl" />
          <div className="overflow-hidden rounded-[2.2rem] border border-white/15 bg-slate-900/90 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-lg">🦷</span>
              <div>
                <p className="text-sm font-bold text-white">موظفة الاستقبال الذكية</p>
                <p className="text-xs text-emerald-400">● متصلة الآن</p>
              </div>
            </div>

            <div className="flex h-[420px] flex-col gap-2 overflow-y-auto p-4">
              <AnimatePresence>
                {messages.map((msg, idx) => {
                  if (msg.type === 'ai-buttons') {
                    return (
                      <motion.div key={`b-${idx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
                        <span className="cursor-pointer rounded-xl bg-gradient-to-l from-violet-500 to-blue-500 px-3 py-2 text-xs font-bold text-white">تأكيد الحجز ✓</span>
                        <span className="cursor-pointer rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-slate-400">لأ، لسه بدي أفكر</span>
                      </motion.div>
                    );
                  }
                  if (msg.type === 'confirm') {
                    return (
                      <motion.div key={`c-${idx}`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3">
                        <p className="text-sm font-bold text-emerald-300">✓ تم تأكيد الحجز</p>
                        <div className="mt-2 space-y-1 text-xs text-slate-300">
                          <p>العيادة: عيادة الدكتورة حلا - نابلس</p>
                          <p>الموعد: اليوم الساعة 4:20 مساءً</p>
                          <p>الاسم: أحمد سالم · 059-123-4567</p>
                        </div>
                      </motion.div>
                    );
                  }
                  if (msg.type === 'reminder') {
                    return (
                      <motion.div key={`r-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-slate-500">
                        ⏰ رح نذكّرك برسالة قبل موعدك بساعة
                      </motion.div>
                    );
                  }
                  const isAi = msg.type === 'ai';
                  return (
                    <motion.div
                      key={`m-${idx}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                        isAi ? 'self-start rounded-bl-md bg-white/10 text-slate-100' : 'self-end rounded-br-md bg-gradient-to-l from-violet-500 to-blue-500 text-white'
                      }`}
                    >
                      {msg.text}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {showTyping && (
                <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-white/10 px-3 py-2.5">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-2 w-2 animate-pulse rounded-full bg-slate-400" style={{ animationDelay: `${d * 0.2}s` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
