'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function BentoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
    </div>
  );
}

interface BentoCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  cta?: string;
  className?: string;
  background?: React.ReactNode;
  /** Tailwind hover border color override. */
  hoverColor?: string;
}

/**
 * BentoCard — premium feature tile with a moving spotlight border, subtle
 * icon tilt on hover, and decorative background layers (particles/meteors).
 */
export function BentoCard({ name, description, icon, href, cta, className, background, hoverColor }: BentoCardProps) {
  const Tag = href ? (motion.a as any) : (motion.div as any);
  return (
    <Tag
      href={href}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      className={cn(
        'group relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur transition-all duration-300',
        'hover:border-cyan-500/60 hover:shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]',
        className
      )}
    >
      {/* animated spotlight border on hover */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(400px circle at var(--mx,50%) var(--my,50%), rgba(16,185,129,0.08), transparent 60%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        onMouseMove={(e) => {
          const r = e.currentTarget.parentElement?.getBoundingClientRect();
          if (r) e.currentTarget.setAttribute('style', `--mx:${e.clientX - r.left}px;--my:${e.clientY - r.top}px`);
        }}
      />
      {background && <div className="pointer-events-none absolute inset-0">{background}</div>}
      <div className="relative z-10">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
          {icon}
        </div>
      </div>
      <div className="relative z-10 mt-5">
        <h3 className="text-lg font-bold text-white">{name}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        {cta && (
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-400 group-hover:text-cyan-300">
            {cta} ←
          </span>
        )}
      </div>
    </Tag>
  );
}
