'use client';

import { motion, useMotionValue } from 'framer-motion';
import { useState, type ReactNode } from 'react';

/**
 * Dock — the macOS-style launcher.
 *
 * N29 adds `variant="inline"`: the ORIGINAL behaviour (`fixed`, bottom-centre of
 * the viewport) stays the default so `/ask` keeps its floating dock untouched,
 * while the dashboard's sticky top bar embeds the same component in the document
 * flow (`inline`) and uses `DockIcon` as a tab.
 */

export type DockVariant = 'fixed' | 'inline';

export function Dock({
  children,
  className,
  variant = 'fixed',
}: {
  children: ReactNode;
  className?: string;
  variant?: DockVariant;
}) {
  const mouseX = useMotionValue(Infinity);
  const layout =
    variant === 'inline'
      ? 'relative flex items-center gap-1 rounded-2xl p-1.5'
      : 'fixed bottom-4 left-1/2 z-50 flex h-14 -translate-x-1/2 items-end gap-3 rounded-2xl px-4 pb-2';

  return (
    <motion.div
      role={variant === 'inline' ? 'tablist' : undefined}
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={`${layout} border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur-lg ${className ?? ''}`}
    >
      {children}
    </motion.div>
  );
}

type DockIconProps = {
  children: ReactNode;
  /** Inline tabs: the selected icon gets the brighter surface. */
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Hover lift in px — 8 keeps the original dock feel, ~3 suits a top bar. */
  lift?: number;
  /** Hover zoom — 1.2 is the launcher feel, ~1.04 suits a wide tab. */
  hoverScale?: number;
};

export function DockIcon({
  children,
  active = false,
  onClick,
  ariaLabel,
  className,
  lift = 8,
  hoverScale = 1.2,
}: DockIconProps) {
  const [hovered, setHovered] = useState(false);
  const interactive = typeof onClick === 'function';
  const surface = active
    ? 'bg-white/15 text-white'
    : 'bg-white/10 text-slate-200 hover:bg-white/20';

  const shared = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    className: `relative grid place-items-center overflow-hidden rounded-xl transition-colors ${surface} ${className ?? 'h-9 w-9'}`,
    animate: hovered ? { y: -lift, scale: hoverScale } : { y: 0, scale: 1 },
    transition: { type: 'spring' as const, stiffness: 300, damping: 18 },
  };

  if (!interactive) {
    return <motion.div {...shared}>{children}</motion.div>;
  }

  return (
    <motion.button
      {...shared}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}
