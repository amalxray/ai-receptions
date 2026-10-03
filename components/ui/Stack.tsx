'use client';

import { useEffect, useMemo, useState } from 'react';

export type StackCard = React.ReactNode;

export type StackProps = {
  cards: StackCard[];
  randomRotation?: boolean;
  sensitivity?: number;
  sendToBackOnClick?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  animationConfig?: { stiffness?: number; damping?: number };
  mobileClickOnly?: boolean;
};

export default function Stack({
  cards,
  randomRotation = false,
  sensitivity = 200,
  sendToBackOnClick = true,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  animationConfig = {},
  mobileClickOnly = false,
}: StackProps) {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const ordered = useMemo(() => (cards.length > 0 ? cards : []), [cards]);

  useEffect(() => {
    if (!autoplay || ordered.length < 2 || isPaused) return;

    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % ordered.length);
    }, autoplayDelay);

    return () => window.clearInterval(id);
  }, [autoplay, autoplayDelay, isPaused, ordered.length]);

  const rotateToBack = () => {
    if (ordered.length < 2) return;
    setActive((prev) => (prev + 1) % ordered.length);
  };

  if (ordered.length === 0) {
    return null;
  }

  // تحويل العرض إلى شريط أفقي (Horizontal Slider)
  return (
    <div
      className="flex snap-x snap-mandatory overflow-x-auto pb-4 scrollbar-hide gap-4"
      onPointerEnter={() => pauseOnHover && setIsPaused(true)}
      onPointerLeave={() => pauseOnHover && setIsPaused(false)}
      aria-label="معرض صور العيادة"
    >
      {ordered.map((card, index) => (
        <div
          key={index}
          className="flex-none snap-center w-[85vw] md:w-[400px] aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm transition-transform duration-300 hover:scale-[1.02]"
          onClick={() => {
            if (mobileClickOnly || !sendToBackOnClick) return;
            rotateToBack();
          }}
        >
          {card}
        </div>
      ))}
    </div>
  );
}