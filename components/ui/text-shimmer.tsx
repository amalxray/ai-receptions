'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
}

export function TextShimmer({ children, className, duration = 2 }: TextShimmerProps) {
  return (
    <motion.p
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: 'linear-gradient(to right, #64748B 0%, #94A3B8 40%, #F1F5F9 50%, #94A3B8 60%, #64748B 100%)',
        backgroundSize: '200% 100%',
      }}
      animate={{ backgroundPositionX: '200%' }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.p>
  );
}
