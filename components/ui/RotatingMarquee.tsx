'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

export type RotatingMarqueeItem = {
  id: string;
  title: string;
  subtitle: string;
  Badge: string;
  color: string;
  accent: string;
  chip: string;
  image?: string;
  imageAlt?: string;
};

type RotatingMarqueeProps = {
  items?: RotatingMarqueeItem[];
  className?: string;
  title?: string;
  variant?: 'dark' | 'light';
};

const defaultItems: RotatingMarqueeItem[] = [
  {
    id: 'clinic-1',
    title: 'دنتايرك',
    subtitle: 'معرض العيادات والسمعة الرقمية',
    Badge: 'مركز تجميل',
    color: 'from-slate-800 via-slate-700 to-slate-900',
    accent: 'from-cyan-400 to-blue-500',
    chip: 'ملف منشأة',
  },
  {
    id: 'clinic-2',
    title: 'قبل / بعد',
    subtitle: 'قصص نجاح مرئية ومقارنات حقيقية',
    Badge: 'حالات حقيقية',
    color: 'from-rose-700 via-orange-600 to-amber-500',
    accent: 'from-pink-500 to-orange-400',
    chip: 'نتائج',
  },
  {
    id: 'clinic-3',
    title: 'العيادة الرقمية',
    subtitle: 'تجربة حجز وسهولة في التفاعل',
    Badge: 'مستقبل',
    color: 'from-indigo-700 via-violet-600 to-fuchsia-500',
    accent: 'from-violet-500 to-cyan-400',
    chip: 'تجربة',
  },
  {
    id: 'clinic-4',
    title: 'الأسنان المتقدمة',
    subtitle: 'خدمات دقيقة مع متابعة مميزة',
    Badge: 'إجراءات',
    color: 'from-emerald-800 via-teal-700 to-cyan-600',
    accent: 'from-emerald-400 to-cyan-400',
    chip: 'خدمات',
  },
  {
    id: 'clinic-5',
    title: 'مواعيد ذكية',
    subtitle: 'جدولة فعالة وتذكير تلقائي',
    Badge: 'إدارة',
    color: 'from-slate-800 via-neutral-700 to-zinc-900',
    accent: 'from-amber-400 to-orange-500',
    chip: 'تجهيز',
  },
];

export default function RotatingMarquee({
  items = defaultItems,
  className = '',
  title = 'قصص عياداتنا في حركة مستمرة',
  variant = 'dark',
}: RotatingMarqueeProps) {
  const isLight = variant === 'light';
  const list = [...items, ...items];
  const viewportRef = useRef<HTMLDivElement>(null), trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current, track = trackRef.current;
    if (!viewport || !track) return;
    const update = () => {
      const bounds = viewport.getBoundingClientRect(), center = bounds.left + bounds.width / 2;
      track.querySelectorAll<HTMLElement>('[data-marquee-card]').forEach((card) => {
        const rect = card.getBoundingClientRect(), delta = rect.left + rect.width / 2 - center;
        const distance = Math.min(1, Math.abs(delta) / (bounds.width / 2));
        const centerWidth = window.matchMedia('(min-width: 640px)').matches ? 390 : 350;
        Object.entries({ scale: 1 - distance * (1 - 280 / centerWidth), rotate: `${Math.sign(delta) * distance * 25}deg`, opacity: 1 - distance * 0.5, blur: `${distance * 8}px`, gray: distance }).forEach(([key, value]) => card.style.setProperty(`--marquee-${key}`, String(value)));
      });
    };
    const timer = window.setInterval(update, 50);
    update();
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={`relative overflow-hidden ${isLight ? 'bg-[#FAFBFC]' : ''} ${className}`}>
      {isLight && <>
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-20 -z-10 h-80 w-80 rounded-full bg-[#8B5CF6]/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-20 -z-10 h-80 w-80 rounded-full bg-[#0EA5E9]/10 blur-3xl" />
      </>}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className={`text-sm font-medium tracking-[0.22em] uppercase ${isLight ? 'rounded-full border border-[#E2E8F0] bg-slate-100 px-3 py-1 text-slate-700' : 'text-slate-300'}`}>Gallery</p>
          <h3 className={`mt-2 text-2xl font-black sm:text-3xl ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
        </div>
        <div className="hidden text-[11px] font-bold text-slate-500 sm:block">
          3D Motion
        </div>
      </div>

      <div ref={viewportRef} className="relative [perspective:1800px]">
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 52, ease: 'linear', repeat: Infinity }}
          className="flex w-max gap-10"
          style={{ transformStyle: 'preserve-3d' }}
          ref={trackRef}
        >
          {list.map((item, index) => (
              <motion.article
                key={`${item.id}-${index}`}
                data-marquee-card
                className={`relative w-[350px] shrink-0 overflow-hidden transition-shadow hover:shadow-xl [--marquee-scale:0.8] sm:w-[390px] sm:[--marquee-scale:0.718] ${isLight ? 'rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm' : ''}`}
                style={{
                  transform: 'perspective(1200px) rotateY(var(--marquee-rotate, 25deg)) scale(var(--marquee-scale))',
                  opacity: 'var(--marquee-opacity, 0.5)',
                  transition: 'transform 500ms ease-out, opacity 500ms ease-out',
                  transformStyle: 'preserve-3d',
                }}
              >
                <div className={`relative overflow-hidden ${!item.image ? `bg-gradient-to-br ${item.color}` : ''}`}>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.imageAlt ?? item.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ filter: 'blur(var(--marquee-blur, 8px)) grayscale(var(--marquee-gray, 1))', transition: 'filter 500ms ease-out' }}
                    />
                  ) : null}
                  {!item.image && <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_35%)]" />}
                  {isLight && <div aria-hidden="true" className="absolute inset-0 bg-white/60" />}
                  <div className={`absolute inset-x-3 top-3 flex items-center justify-between text-[10px] font-bold drop-shadow-md ${isLight ? 'text-slate-700' : 'text-white'}`}>
                    <span>{item.chip}</span>
                    <span className={`inline-flex h-2 w-2 rounded-full bg-gradient-to-r ${item.accent}`} />
                  </div>

                  <div className="relative flex h-[180px] items-end justify-between sm:h-[200px]">
                    <div className={`space-y-2 drop-shadow-md ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      <div className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-white/80'}`}>{item.Badge}</div>
                      <div className="text-xl font-black sm:text-2xl">{item.title}</div>
                    </div>
                    <div className={`flex h-12 w-12 items-center justify-center text-xl drop-shadow-md ${isLight ? 'text-slate-400' : 'text-white'}`}>
                      ✦
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-200'}`}>{item.subtitle}</p>
                </div>
              </motion.article>
            ))}
        </motion.div>
      </div>
    </section>
  );
}
