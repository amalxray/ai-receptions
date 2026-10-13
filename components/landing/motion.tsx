'use client';

import { motion, useInView, useSpring } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

/**
 * Shared Framer Motion helpers for the landing page.
 * - FadeUp: fade + slide-up on scroll into view.
 * - Stagger: container that staggers its FadeUp/motion children.
 */

type FadeUpProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
};

export function FadeUp({ children, delay = 0, y = 28, className }: FadeUpProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  stagger?: number;
};

export function Stagger({ children, className, delayChildren = 0.05, stagger = 0.08 }: StaggerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden: {},
        visible: { transition: { delayChildren, staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

/**
 * LetterReveal: reveals text one character at a time with a subtle upward
 * spring. Spaces are preserved as non-breaking so words stay intact.
 */
type LetterRevealProps = {
  text: string;
  className?: string;
  charClassName?: string;
  delay?: number;
  stagger?: number;
};

export function LetterReveal({ text, className, charClassName, delay = 0, stagger = 0.03 }: LetterRevealProps) {
  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="visible"
      aria-label={text}
      variants={{
        hidden: {},
        visible: { transition: { delayChildren: delay, staggerChildren: stagger } },
      }}
    >
      {Array.from(text).map((char, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className={charClassName}
          variants={{
            hidden: { opacity: 0, y: '0.4em' },
            visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 18 } },
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.span>
  );
}

/**
 * TiltCard: wraps children in a card that tilts toward the cursor and lifts on
 * hover for a playful 3D feel. Falls back to a plain lift on touch devices.
 */
type TiltCardProps = {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
};

export function TiltCard({ children, className, maxTilt = 8 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(0, { stiffness: 260, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * maxTilt * 2);
    rotateX.set(-py * maxTilt * 2);
  };

  const handleLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      {children}
    </motion.div>
  );
}