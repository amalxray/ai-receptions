'use client';

import { useEffect, useRef, useState } from 'react';

export type AchievementItem = {
  id: string;
  value: string;
  title: string;
  icon?: string;
  background_color?: string;
  font_size?: string;
};

export default function AchievementsSection({ items }: { items: AchievementItem[] }) {
  // Temporary frontend-only demo data for preview when clinic records are empty.
  const safeItems = items.length
    ? items
    : [
        { id: 'demo-achievement-1', value: '2778', title: 'حالات تم إنهاؤها', icon: '✓', background_color: 'linear-gradient(135deg,#0f172a 0%,#0f766e 100%)', font_size: 'medium' },
        { id: 'demo-achievement-2', value: '7622', title: 'مراجعات موثقة', icon: '❤', background_color: 'linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)', font_size: 'medium' },
        { id: 'demo-achievement-3', value: '10400', title: 'زيارة سنويًا', icon: '✦', background_color: 'linear-gradient(135deg,#164e63 0%,#0ea5e9 100%)', font_size: 'large' },
        { id: 'demo-achievement-4', value: '98%', title: 'رضا المرضى', icon: '★', background_color: 'linear-gradient(135deg,#1d4ed8 0%,#22c55e 100%)', font_size: 'medium' },
      ];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-12">
      <div className="mb-6 text-center">
        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">
          Impact
        </span>
        <h2 className="mt-3 text-2xl font-black text-slate-800 sm:text-3xl">إنجازاتنا</h2>
        <p className="mt-2 text-sm text-slate-500">أرقام تعكس الثقة، الجودة، والنتائج المتكررة.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {safeItems.map((item, index) => (
          <MetricCard key={item.id} item={item} delay={index * 110} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ item, delay }: { item: AchievementItem; delay: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  const endValue = Number(String(item.value).replace(/[^\d]/g, '')) || 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !endValue) return;

    let start: number | null = null;
    const duration = 1600;

    const tick = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(endValue * eased));

      if (progress < 1) requestAnimationFrame(tick);
    };

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, endValue]);

  const displayValue = `${count.toLocaleString('en-US')}${String(item.value).includes('%') ? '%' : ''}`;

  return (
    <div
      ref={ref}
      className="rounded-[26px] border border-white/10 bg-slate-900 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
      style={{
        background: item.background_color ?? 'linear-gradient(135deg,#0f172a 0%,#0f766e 100%)',
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl shadow-[0_0_22px_rgba(255,255,255,0.12)]">
          {item.icon ?? '✦'}
        </span>
        <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
          live
        </span>
      </div>

      <div className="font-black leading-none tracking-tight" style={{ fontSize: item.font_size === 'large' ? '2.9rem' : item.font_size === 'small' ? '2rem' : '2.4rem' }}>
        {displayValue}
      </div>

      <p className="mt-2 text-sm font-semibold text-white/80">{item.title}</p>
    </div>
  );
}
