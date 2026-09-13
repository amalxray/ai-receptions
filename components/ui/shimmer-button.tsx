'use client';

import { motion } from 'framer-motion';

type ShimmerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  shimmerColor?: string;
};

export function ShimmerButton({ children, className = '', shimmerColor = 'rgba(255,255,255,0.35)', ...props }: ShimmerButtonProps) {
  return (
    <button
      {...props}
      className={`relative overflow-hidden rounded-full px-8 py-3 text-base font-bold text-white transition-transform hover:scale-[1.03] active:scale-95 ${className}`}
      style={{ background: 'linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)', ...props.style }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(110deg, transparent 25%, ${shimmerColor} 50%, transparent 75%)`,
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPositionX: ['200%', '-100%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  );
}
