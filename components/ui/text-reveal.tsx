'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextRevealProps {
  text: string;
  className?: string;
  /** Seconds per word. */
  duration?: number;
  delay?: number;
}

/**
 * Text Reveal — reveals the text word-by-word with blur + rise.
 * Arabic-safe: splits on spaces (no letter splitting that breaks shaping).
 */
export function TextReveal({ text, className, duration = 0.5, delay = 0 }: TextRevealProps) {
  const words = text.split(' ').filter(Boolean);
  return (
    <span className={cn('inline', className)}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block will-change-transform"
          initial={{ opacity: 0, y: '0.6em', filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration, delay: delay + i * (duration / words.length), ease: 'easeOut' }}
        >
          {word}
          {i < words.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </span>
  );
}
