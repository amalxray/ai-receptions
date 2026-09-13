'use client';

import { motion } from 'framer-motion';

interface TextShimmerWaveProps {
  children: string;
  className?: string;
  duration?: number;
}

export function TextShimmerWave({ children, className, duration = 2 }: TextShimmerWaveProps) {
  return (
    <span className={className}>
      {children.split('').map((ch, i) => (
        <motion.span
          key={i}
          className="inline-block"
          style={{
            backgroundImage: 'linear-gradient(135deg, #10B981 0%, #0EA5E9 50%, #10B981 100%)',
            backgroundSize: '200% 100%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}
          animate={{ backgroundPositionX: ['200%', '-100%'] }}
          transition={{ duration, repeat: Infinity, ease: 'linear', delay: (i * duration) / (children.length * 2) }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </motion.span>
      ))}
    </span>
  );
}
