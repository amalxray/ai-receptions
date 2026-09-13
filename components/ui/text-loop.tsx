'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface TextLoopProps {
  children: React.ReactNode;
  className?: string;
  interval?: number;
}

export function TextLoop({ children, className, interval = 2200 }: TextLoopProps) {
  const items = Array.isArray(children) ? children : [children];
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items.length, interval]);
  if (!mounted) return <span className={className}>{items[0]}</span>;
  return (
    <span className={className} style={{ display: 'inline-flex', overflow: 'hidden', verticalAlign: 'bottom' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={index}
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -22, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {items[index % items.length]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
