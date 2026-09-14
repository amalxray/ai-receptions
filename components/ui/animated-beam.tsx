'use client';

import { useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedBeamProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
  curvature?: number;
  pathColor?: string;
  pathWidth?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  duration?: number;
  delay?: number;
}
export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = -40,
  pathColor = '#1E293B',
  pathWidth = 2,
  gradientStartColor = '#0EA5E9',
  gradientStopColor = '#7C3AED',
  duration = 4,
  delay = 0,
}: AnimatedBeamProps) {
  const id = useId().replace(/:/g, '');
  const [d, setD] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      const f = fromRef.current;
      const t = toRef.current;
      if (!c || !f || !t) return;
      const cr = c.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const x1 = fr.left + fr.width / 2 - cr.left;
      const y1 = fr.top + fr.height / 2 - cr.top;
      const x2 = tr.left + tr.width / 2 - cr.left;
      const y2 = tr.top + tr.height / 2 - cr.top;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const cpx = mx - (dy / len) * curvature;
      const cpy = my + (dx / len) * curvature;
      setD('M ' + x1 + ' ' + y1 + ' Q ' + cpx + ' ' + cpy + ' ' + x2 + ' ' + y2);
      setSize({ w: cr.width, h: cr.height });
    };
    compute();
    window.addEventListener('resize', compute);
    const t = window.setTimeout(compute, 150);
    return () => {
      window.removeEventListener('resize', compute);
      clearTimeout(t);
    };
  }, [containerRef, fromRef, toRef, curvature]);
  if (!d) return null;

  return (
    <svg className='pointer-events-none absolute inset-0 z-0 h-full w-full' width={size.w} height={size.h} viewBox={'0 0 ${size.w} ${size.h}'} fill='none'>
      <defs>
        <linearGradient id={`grad-${id}`} x1='0%' y1='0%' x2='100%' y2='100%'>
          <stop offset='0%' stopColor={gradientStartColor} />
          <stop offset='100%' stopColor={gradientStopColor} />
        </linearGradient>
      </defs>
      <path d={d} stroke={pathColor} strokeWidth={pathWidth} strokeLinecap='round' strokeDasharray='2 6' />
      <motion.circle r={5} style={{ offsetPath: `path("${d}")` }} animate={{ offsetDistance: ['0%', '100%'] }} transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }} fill={`url(#grad-${id})`} />
    </svg>
  );
}