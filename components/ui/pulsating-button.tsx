'use client';

import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

type PulsatingButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  pulseColor?: string;
  children?: ReactNode;
};

/** PulsatingButton — button with expanding pulse rings behind it. */
export function PulsatingButton({ children, className = '', pulseColor = '#10B981', ...props }: PulsatingButtonProps) {
  return (
    <motion.button
      {...props}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className={`relative rounded-full px-8 py-4 font-bold text-white ${className}`}
      style={{ background: 'linear-gradient(135deg,#10B981,#0EA5E9)', ...props.style }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full"
          style={{ background: pulseColor }}
          animate={{ scale: [1, 1.6], opacity: [0.45, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
