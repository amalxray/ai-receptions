'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedShinyTextProps {
  children: React.ReactNode;
  className?: string;
  shimmerWidth?: number;
}

/** AnimatedShinyText — silver shimmer sweeping across the text. */
export function AnimatedShinyText({ children, className, shimmerWidth = 100 }: AnimatedShinyTextProps) {
  return (
    <motion.span
      className={cn(
        'max-w-full text-transparent bg-clip-text',
        'bg-gradient-to-r from-slate-500/80 via-white to-slate-500/80',
        className
      )}
      style={{ backgroundSize: `${shimmerWidth}% 100%` }}
      animate={{ backgroundPositionX: ['100%', '-100%'] }}
      transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}
