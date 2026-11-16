'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type MotionStyle } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const AUTOPLAY_MS = 5000;

type HeroCoverSliderProps = {
  images: string[];
  style?: MotionStyle;
};

function shuffleImages(images: string[]): string[] {
  const shuffled = [...images];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export default function HeroCoverSlider({ images, style }: HeroCoverSliderProps) {
  const sourceImages = useRef(images);
  const hasShuffled = useRef(false);
  const [orderedImages, setOrderedImages] = useState(images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (hasShuffled.current) return;
    hasShuffled.current = true;
    setOrderedImages(shuffleImages(sourceImages.current));
  }, []);

  useEffect(() => {
    if (prefersReducedMotion !== false || isHovered || orderedImages.length < 2) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % orderedImages.length);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(intervalId);
  }, [isHovered, orderedImages.length, prefersReducedMotion]);

  if (orderedImages.length === 0) return null;

  const activeImage = orderedImages[activeIndex] ?? orderedImages[0];
  const priorityImage = sourceImages.current[0];
  const controlsVisibility =
    'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:opacity-100 [@media(hover:none)]:opacity-100';

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + orderedImages.length) % orderedImages.length);
  };
  const showNext = () => {
    setActiveIndex((current) => (current + 1) % orderedImages.length);
  };

  return (
    <motion.div
      role="region"
      aria-label="صور الغلاف"
      aria-roledescription="carousel"
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative aspect-[1200/630] w-full overflow-hidden rounded-2xl shadow-2xl"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={activeImage}
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.02 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          <Image
            src={activeImage}
            alt={`مركز أمل لتصوير الأسنان والفكين — صورة ${activeIndex + 1}`}
            fill
            priority={activeImage === priorityImage}
            loading={activeImage === priorityImage ? undefined : 'lazy'}
            sizes="(max-width: 1200px) 100vw, 1152px"
            unoptimized={/^https?:\/\//i.test(activeImage)}
            className="object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {orderedImages.length > 1 && (
        <>
          <button
            type="button"
            onClick={showPrevious}
            aria-label="الصورة السابقة"
            className={`absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/55 text-white shadow-lg backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${controlsVisibility}`}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={showNext}
            aria-label="الصورة التالية"
            className={`absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/55 text-white shadow-lg backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${controlsVisibility}`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>

          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-2">
            {orderedImages.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`عرض الصورة ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={`h-2.5 w-2.5 rounded-full border border-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                  index === activeIndex ? 'bg-emerald-400' : 'bg-slate-950/40 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
