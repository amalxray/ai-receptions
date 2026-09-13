'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

export function NumberTicker({ value, startValue = 0, className }: { value: number; startValue?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(startValue);

  useEffect(() => {
    if (!inView) return;
    const duration = 1500;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(startValue + (value - startValue) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, startValue]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString('en-US')}
    </span>
  );
}
