'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useRef, useState } from 'react';

export function Dock({ children, className }: { children: React.ReactNode; className?: string }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={`fixed bottom-4 left-1/2 z-50 flex h-14 -translate-x-1/2 items-end gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 pb-2 shadow-2xl backdrop-blur-lg ${className ?? ''}`}
    >
      {children}
    </motion.div>
  );
}

export function DockIcon({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-slate-200 transition-colors hover:bg-white/20"
      animate={hovered ? { y: -8, scale: 1.2 } : { y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      {children}
    </motion.div>
  );
}
