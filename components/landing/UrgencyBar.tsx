'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FOUNDING_SLOTS_TOTAL } from '@/lib/landing/landing-copy';
import { useLandingCopy } from '@/components/landing/LandingContent';
import LandingButton from './LandingButton';

/**
 * Sticky urgency bar showing how many founding places remain.
 * The number is fetched live from /api/landing/founding-slots which reads
 * 100 - COUNT(*) WHERE is_founding_member=true. Falls back to the total
 * if the migration is not applied yet.
 */
export type UrgencyBarContent = {
  text: string;
  suffix: string;
  cta: string;
  backgroundColor: string;
  textColor: string;
  tickerSpeed: 'off' | 'slow' | 'normal' | 'fast';
};

export default function UrgencyBar({ previewContent }: { previewContent?: UrgencyBarContent }) {
  const copy = useLandingCopy();
  const urgency = previewContent ?? copy.urgencyBar as UrgencyBarContent;
  const [remaining, setRemaining] = useState<number>(FOUNDING_SLOTS_TOTAL);

  useEffect(() => {
    if (previewContent) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/landing/founding-slots');
        const data = await res.json();
        if (!cancelled && typeof data.remaining === 'number') {
          setRemaining(data.remaining);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewContent]);

  const text = <>⚡ {urgency.text} <span className="font-mono font-bold text-landing-indigo">{remaining}</span> {urgency.suffix}</>;
  const tickerDuration = urgency.tickerSpeed === 'fast' ? 12 : urgency.tickerSpeed === 'normal' ? 22 : 34;

  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="sticky top-[72px] z-40 border-b backdrop-blur-md"
      style={{ backgroundColor: urgency.backgroundColor, color: urgency.textColor, borderColor: `${urgency.textColor}22` }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-4 py-3 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-right lg:px-8">
        <div className="w-full min-w-0 overflow-hidden text-sm font-semibold sm:text-base">
          {urgency.tickerSpeed === 'off' ? <p>{text}</p> : (
            <motion.div className="flex w-max gap-12 whitespace-nowrap" animate={{ x: ['0%', '-50%'] }} transition={{ duration: tickerDuration, repeat: Infinity, ease: 'linear' }}>
              {[0, 1, 2, 3].map((copyIndex) => <span key={copyIndex} className="px-4">{text}</span>)}
            </motion.div>
          )}
        </div>
        <LandingButton href="#pricing" size="md" className="whitespace-nowrap" style={{ background: 'var(--landing-cta)', color: '#fff' }}>
          {urgency.cta}
        </LandingButton>
      </div>
    </motion.div>
  );
}