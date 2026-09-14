'use client';

import { motion } from 'framer-motion';

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  reverse?: boolean;
}

/** BorderBeam — a light beam traveling around the border of its parent. */
export function BorderBeam({ className, size = 60, duration = 8, colorFrom = '#10B981', colorTo = '#0EA5E9', delay = 0, reverse = false }: BorderBeamProps) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent)]">
      <motion.div
        className="absolute aspect-square bg-gradient-to-l from-transparent via-neutral-300 to-transparent"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
        }}
        animate={{
          offsetDistance: reverse ? ['100%', '0%'] : ['0%', '100%'],
        }}
        transition={{ repeat: Infinity, ease: 'linear', duration, delay: -delay }}
      >
        <div
          className="h-full w-[40px] -translate-x-1/2 rotate-90"
          style={{ background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)` }}
        />
      </motion.div>
    </div>
  );
}
