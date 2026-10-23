'use client';

/**
 * PUBLIC GALLERY CAROUSEL — replaces the old auto-scrolling marquee.
 *
 * A) Carousel (in-page): one large centered slide, prev/next arrows, dot
 *    navigation, mouse-drag / touch-swipe, smooth 600ms fade+scale. NO
 *    auto-play — the visitor is always in control.
 * B) Lightbox (on click): full-screen overlay, prev/next, thumbnail strip,
 *    ESC to close, drag/swipe on mobile.
 *
 * Pure presentation (framer-motion); no DB/booking/RPC access.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type { LightboxMedia } from './PublicGalleryLightbox';
import ClickToPlayVideo, { VideoPoster } from './ClickToPlayVideo';

const SWIPE_THRESHOLD = 60;

export default function ImageCarousel({ media, className }: { media: LightboxMedia[]; className?: string }) {
  const [[index, direction], setState] = useState<[number, number]>([0, 0]);
  const [lightbox, setLightbox] = useState(false);
  const count = media.length;

  const paginate = useCallback(
    (dir: number) => {
      setState(([i]) => [(i + dir + count) % count, dir]);
    },
    [count],
  );

  const goTo = useCallback((i: number) => {
    setState(([prev]) => [i, i > prev ? 1 : -1]);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      else if (e.key === 'ArrowRight') paginate(1);
      else if (e.key === 'ArrowLeft') paginate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, paginate]);

  if (count === 0) return null;
  const current = media[index];

  const slideVariants = {
    enter: (d: number) => ({ opacity: 0, scale: 0.94, x: d > 0 ? 60 : -60 }),
    center: { opacity: 1, scale: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, scale: 0.94, x: d > 0 ? -60 : 60 }),
  };

  const renderMedia = (item: LightboxMedia, rounded: string, playable = false) =>
    item.media_type === 'video' ? (
      playable ? (
        <ClickToPlayVideo src={item.public_url} title={item.title ?? undefined} className={`${rounded} max-h-[80vh] w-auto`} />
      ) : (
        <VideoPoster title={item.title ?? undefined} className={`${rounded} h-full w-full`} />
      )
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.public_url} alt={item.alt_text || item.title || 'صورة من المعرض'} className={`${rounded} h-full w-full bg-slate-100 object-contain`} />
    );

  return (
    <div className={className}>
      {/* A) Carousel */}
      <div className="relative mx-auto w-full max-w-3xl select-none">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-lg">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={index}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE_THRESHOLD) paginate(1);
                else if (info.offset.x > SWIPE_THRESHOLD) paginate(-1);
              }}
              onClick={() => setLightbox(true)}
              className="absolute inset-0 cursor-pointer"
            >
              {renderMedia(current, 'rounded-3xl')}
              {current.title && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <p className="text-sm font-semibold text-white">{current.title}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          {count > 1 && (
            <>
              <button type="button" aria-label="السابق" onClick={(e) => { e.stopPropagation(); paginate(-1); }} className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-2xl text-slate-700 shadow-md transition hover:scale-110 hover:bg-white">›</button>
              <button type="button" aria-label="التالي" onClick={(e) => { e.stopPropagation(); paginate(1); }} className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-2xl text-slate-700 shadow-md transition hover:scale-110 hover:bg-white">‹</button>
            </>
          )}
        </div>
        {count > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2" dir="ltr">
            {media.map((item, i) => (
              <button key={item.id || i} type="button" aria-label={`الصورة ${i + 1}`} aria-current={i === index} onClick={() => goTo(i)} className={`h-2.5 rounded-full transition-all ${i === index ? 'w-6 bg-blue-600' : 'w-2.5 bg-slate-300 hover:bg-slate-400'}`} />
            ))}
          </div>
        )}
      </div>

      {/* B) Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 text-white">
              <span className="text-sm font-medium">{index + 1} / {count}</span>
              <button type="button" aria-label="إغلاق" onClick={() => setLightbox(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-2xl leading-none transition hover:bg-white/25">×</button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
              {count > 1 && (
                <button type="button" aria-label="السابق" onClick={() => paginate(-1)} className="absolute right-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-3xl text-white transition hover:scale-110 hover:bg-white/25">›</button>
              )}
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.div
                  key={index}
                  custom={direction}
                  initial={{ opacity: 0, x: direction > 0 ? 80 : -80 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction > 0 ? -80 : 80 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -SWIPE_THRESHOLD) paginate(1);
                    else if (info.offset.x > SWIPE_THRESHOLD) paginate(-1);
                  }}
                  className="flex max-h-full w-full items-center justify-center"
                >
                  {renderMedia(current, 'rounded-xl', true)}
                </motion.div>
              </AnimatePresence>
              {count > 1 && (
                <button type="button" aria-label="التالي" onClick={() => paginate(1)} className="absolute left-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-3xl text-white transition hover:scale-110 hover:bg-white/25">‹</button>
              )}
            </div>

            {count > 1 && (
              <div className="flex gap-2 overflow-x-auto px-5 py-4 scrollbar-hide" dir="ltr">
                {media.map((item, i) => (
                  <button key={`thumb-${item.id || i}`} type="button" aria-label={`الصورة ${i + 1}`} onClick={() => goTo(i)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === index ? 'border-blue-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    {item.media_type === 'video' ? (
                      <span className="grid h-full w-full place-items-center bg-slate-800 text-2xl">▶</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.public_url} alt="" className="h-full w-full bg-slate-100 object-contain" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

