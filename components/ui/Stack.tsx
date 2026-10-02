'use client';

import { useEffect, useMemo, useState } from 'react';
import './Stack.css';

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
  const [pointerActive, setPointerActive] = useState(false);

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

  const onPointerDown = () => {
    if (mobileClickOnly) return;
    setPointerActive(true);
  };

  const onPointerUp = () => {
    if (mobileClickOnly) return;
    setPointerActive(false);
    if (sendToBackOnClick) rotateToBack();
  };

  const rotationByIndex = (index: number) => {
    if (!randomRotation) return index % 2 === 0 ? -7 : 7;
    const offsets = [-9, 8, 6, -10, 7, -6, 9, -8];
    return offsets[index % offsets.length];
  };

  if (ordered.length === 0) {
    return null;
  }

  return (
    <div
      className="stack-shell"
      onPointerEnter={() => pauseOnHover && setIsPaused(true)}
      onPointerLeave={() => pauseOnHover && setIsPaused(false)}
      onMouseDown={onPointerDown}
      onMouseUp={onPointerUp}
      onTouchStart={() => setPointerActive(true)}
      onTouchEnd={() => {
        setPointerActive(false);
        if (sendToBackOnClick) rotateToBack();
      }}
      style={{
        ['--stack-sensitivity' as string]: `${sensitivity}px`,
        ['--stack-stiffness' as string]: `${animationConfig.stiffness ?? 180}`,
        ['--stack-damping' as string]: `${animationConfig.damping ?? 18}`,
      }}
    >
      <div className="stack-viewport" aria-label="معرض صور العيادة">
        {ordered.map((card, index) => {
          const isTop = index === active;
          const offset = (ordered.length - index - 1) * 10;
          const depth = clamp(index - active, 0, ordered.length - 1);
          const transform = isTop
            ? 'translate3d(0, 0, 0) rotate(0deg) scale(1)'
            : `translate3d(${(index - active) * 12}px, ${depth * 10}px, 0) rotate(${rotationByIndex(index)}deg) scale(${1 - depth * 0.04})`;

          return (
            <button
              key={index}
              type="button"
              className={`stack-card ${isTop ? 'is-top' : ''} ${pointerActive ? 'is-active' : ''}`}
              onClick={() => {
                if (mobileClickOnly || !sendToBackOnClick) return;
                rotateToBack();
              }}
              style={{
                transform,
                zIndex: ordered.length - index,
                marginTop: `${offset}px`,
              }}
            >
              {card}
            </button>
          );
        })}
      </div>
    </div>
  );
}
