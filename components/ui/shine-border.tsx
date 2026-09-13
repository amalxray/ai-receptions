'use client';

import { motion } from 'framer-motion';

type ShineBorderProps = React.HTMLAttributes<HTMLDivElement> & {
  borderWidth?: number;
  duration?: number;
  shineColor?: string | string[];
};

export function ShineBorder({ borderWidth = 1.5, duration = 14, shineColor = ['#10B981', '#0EA5E9'], className, children, style }: ShineBorderProps) {
  const colors = Array.isArray(shineColor) ? shineColor : [shineColor];
  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          padding: borderWidth,
          background: `conic-gradient(from 0deg, transparent 0deg, ${colors[0]} 90deg, ${colors[1] ?? colors[0]} 180deg, transparent 270deg)`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        }}
      />
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          background: `conic-gradient(from 0deg, transparent 60deg, ${colors[0]} 120deg, ${colors[1] ?? colors[0]} 180deg, transparent 240deg)`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: borderWidth,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      />
      {children}
    </div>
  );
}
