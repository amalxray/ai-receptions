'use client';

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
  // Duplicate the sequence once so the CSS track loops seamlessly after a full pass.
  const list = [...items, ...items];

  return (
    <section className={`relative overflow-hidden ${isLight ? 'bg-[#FAFBFC]' : ''} ${className}`}>
      {isLight && <>
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-20 -z-10 h-80 w-80 rounded-full bg-[#8B5CF6]/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-20 -z-10 h-80 w-80 rounded-full bg-[#0EA5E9]/10 blur-3xl" />
      </>}
      <div className="mx-auto mb-6 max-w-6xl px-4 sm:mb-8">
        <div>
          <p className="hidden">Gallery</p>
          <h3 className={`text-xl font-black sm:text-2xl ${isLight ? 'text-slate-900' : 'text-white'}`}>{title}</h3>
        </div>
        <div className="hidden text-[11px] font-bold text-slate-500">
          3D Motion
        </div>
      </div>

      <div dir="ltr" className="group relative mx-auto w-full max-w-6xl overflow-hidden px-4">
        <div className="flex w-max items-center gap-4 py-3 animate-ticker [animation-duration:90s] motion-reduce:animate-none group-hover:[animation-play-state:paused]">
          {list.map((item, index) => {
            const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const delta = event.clientX - (bounds.left + bounds.width / 2);
              const distance = Math.min(1, Math.abs(delta) / (bounds.width / 2));
              const rotateY = delta > 0 ? 8 * distance : -8 * distance;
              const translateX = delta * 0.12;
              event.currentTarget.style.transform = `perspective(1000px) rotateY(${rotateY}deg) translateX(${translateX}px)`;
            };

            const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
              event.currentTarget.style.transform = '';
            };

            return (
              <article
                key={`${item.id}-${index}`}
                data-marquee-card
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
                className={`group relative w-56 shrink-0 overflow-hidden rounded-2xl border p-2 shadow-sm transition duration-500 hover:-translate-y-1 hover:scale-[1.025] hover:shadow-xl sm:w-64 ${isLight ? 'border-slate-200 bg-white' : 'border-white/15 bg-slate-900'}`}
              >
                <div className={`relative h-36 overflow-hidden rounded-xl sm:h-40 ${!item.image ? `bg-gradient-to-br ${item.color}` : ''}`}>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.imageAlt ?? item.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  {!item.image && <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_35%)]" />}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
