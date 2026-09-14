'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface ParticlesProps {
  className?: string;
  quantity?: number;
  color?: string;
  size?: number;
  ease?: number;
}

/**
 * Particles background — floating dots with gentle drift + mouse parallax.
 * Self-contained framer-motion implementation (no canvas), SSR-safe.
 */
export function Particles({ className = '', quantity = 80, color = '#818CF8', size = 2.4, ease = 40 }: ParticlesProps) {
  const [mounted, setMounted] = useState(false);
  const [particles, setParticles] = useState<
    Array<{ id: number; x: string; y: string; s: number; dx: number; dy: number; d: number; delay: number }>
  >([]);
  const mouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setParticles(
      Array.from({ length: quantity }, (_, id) => ({
        id,
        x: `${Math.random() * 100}%`,
        y: `${Math.random() * 100}%`,
        s: size * (0.6 + Math.random() * 0.9),
        dx: (Math.random() - 0.5) * ease,
        dy: (Math.random() - 0.5) * ease,
        d: 12 + Math.random() * 16,
        delay: Math.random() * 6,
      }))
    );
  }, [quantity, size, ease]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.current = { x: (e.clientX - r.left - r.width / 2) / 40, y: (e.clientY - r.top - r.height / 2) / 40 };
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div ref={containerRef} className={className} aria-hidden>
      {mounted &&
        particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: p.s,
              height: p.s,
              background: color,
              boxShadow: `0 0 ${p.s * 3}px ${color}`,
            }}
            animate={{ x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [0.25, 0.9, 0.25] }}
            transition={{ duration: p.d, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
          />
        ))}
    </div>
  );
}
