'use client';

import { motion } from 'framer-motion';

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
}: RotatingMarqueeProps) {
  const list = [...items, ...items];

  return (
    <section className={`relative overflow-hidden py-10 sm:py-14 ${className}`}>
      <div className="mb-8 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-medium tracking-[0.22em] text-slate-400 uppercase">Gallery</p>
          <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h3>
        </div>
        <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200 sm:block">
          3D Motion
        </div>
      </div>

      <div className="relative [perspective:1800px]">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0b1120] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0b1120] to-transparent" />

        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 26, ease: 'linear', repeat: Infinity }}
          className="flex w-max gap-5 px-4 sm:px-6 lg:px-8"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {list.map((item, index) => {
            const phase = index % 3;
            const isCenter = phase === 1;
            const angle = phase === 0 ? -25 : phase === 1 ? 0 : 25;
            const scale = isCenter ? 1 : 0.72;
            const opacity = isCenter ? 1 : 0.62;
            const blur = isCenter ? '0px' : '2px';
            const width = isCenter ? 'w-[250px] sm:w-[290px]' : 'w-[200px] sm:w-[220px]';

            return (
              <motion.article
                key={`${item.id}-${index}`}
                className={`group relative shrink-0 overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/40 p-3 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.85)] backdrop-blur-sm ${width}`}
                style={{
                  transform: `perspective(1200px) rotateY(${angle}deg) scale(${scale})`,
                  opacity,
                  filter: `blur(${blur})`,
                  transformStyle: 'preserve-3d',
                }}
                whileHover={{ y: -6, scale: isCenter ? 1.02 : 0.75 }}
              >
                <div className={`relative overflow-hidden rounded-[22px] bg-gradient-to-br ${item.color}`}>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.imageAlt ?? item.title}
                      className={`absolute inset-0 h-full w-full object-cover ${isCenter ? 'saturate-100' : 'grayscale saturate-50'}`}
                    />
                  ) : null}
                  <div className={`absolute inset-0 ${item.image ? 'bg-slate-950/35' : 'bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_35%)]'}`} />
                  <div className={`absolute inset-x-3 top-3 flex items-center justify-between rounded-full bg-black/15 px-2.5 py-1 text-[10px] font-bold text-white/90 backdrop-blur-sm`}>
                    <span>{item.chip}</span>
                    <span className={`inline-flex h-2 w-2 rounded-full bg-gradient-to-r ${item.accent}`} />
                  </div>

                  <div className="relative flex h-[180px] items-end justify-between p-4 sm:h-[200px]">
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-white/80">{item.Badge}</div>
                      <div className="text-xl font-black text-white sm:text-2xl">{item.title}</div>
                    </div>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} text-xl shadow-lg shadow-black/20`}>
                      ✦
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 px-1">
                  <p className="text-xs font-medium text-slate-300">{item.subtitle}</p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
