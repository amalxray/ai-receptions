'use client';
import { useEffect, useMemo, useState } from 'react';

export type StackCard = React.ReactNode;
export type StackProps = {
  cards: StackCard[];
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  randomRotation?: boolean;
  sensitivity?: number;
  sendToBackOnClick?: boolean;
  animationConfig?: { stiffness?: number; damping?: number };
  mobileClickOnly?: boolean;
};

export default function Stack({
  cards,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  randomRotation: _randomRotation = false,
  sensitivity: _sensitivity = 250,
  sendToBackOnClick: _sendToBackOnClick = true,
  animationConfig: _animationConfig = {},
  mobileClickOnly: _mobileClickOnly = false,
}: StackProps) {
  const [isPaused, setIsPaused] = useState(false);
  const ordered = useMemo(() => (cards.length > 0 ? cards : []), [cards]);

  useEffect(() => {
    if (!autoplay || ordered.length < 2 || isPaused) return;

    const id = window.setInterval(() => {}, autoplayDelay);
    return () => window.clearInterval(id);
  }, [autoplay, autoplayDelay, isPaused, ordered.length]);

  if (ordered.length === 0) return null;

  return (
    <div
      className="flex snap-x snap-mandatory overflow-x-auto pb-4 scrollbar-hide gap-4"
      onPointerEnter={() => pauseOnHover && setIsPaused(true)}
      onPointerLeave={() => pauseOnHover && setIsPaused(false)}
    >
      {ordered.map((card, index) => (
        <div
          key={index}
          className="flex-none snap-center w-[85vw] md:w-[400px] aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:scale-[1.02] transition-transform"
        >
          {card}
        </div>
      ))}
    </div>
  );
}
