'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface BlurFadeProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  inView?: boolean;
  yOffset?: number;
}

export function BlurFade({ children, className, delay = 0, duration = 0.5, inView = false, yOffset = 12 }: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: '-40px' });
  const shouldAnimate = inView ? inViewResult : true;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, filter: 'blur(8px)', y: yOffset }}
      animate={shouldAnimate ? { opacity: 1, filter: 'blur(0px)', y: 0 } : {}}
      transition={{ delay, duration, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
