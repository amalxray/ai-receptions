'use client';

import { motion } from 'framer-motion';

export function Ripple({ color = '#10B981', number = 3, className }: { color?: string; number?: number; className?: string }) {
  return (
    <div className={className ?? ''} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: number }, (_, i) => (
        <motion.span
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '100%',
            height: '100%',
            borderRadius: '9999px',
            border: `2px solid ${color}`,
            transform: 'translate(-50%,-50%)',
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
