'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Maximize2, X, Play, ChevronLeft, ChevronRight } from 'lucide-react';

type GalleryItem = {
  id: string;
  title: string;
  image_url?: string | null;
  video_url?: string | null;
  category?: string | null;
  media_type?: 'image' | 'video' | null;
};

type GalleryGridDisplay = {
  gallerySizePx?: number;
  gallerySpeed?: 'slow' | 'normal' | 'fast';
  galleryFit?: 'cover' | 'contain';
};

type GalleryGridProps = {
  images: GalleryItem[];
  videos: GalleryItem[];
  display?: GalleryGridDisplay;
};

export default function GalleryGrid({
  images = [],
  videos = [],
  display = {},
}: GalleryGridProps) {
  const items: GalleryItem[] = [
    ...images.map((item) => ({
      ...item,
      media_type: item.media_type === 'video' || item.video_url ? 'video' as const : 'image' as const,
    })),
    ...videos
      .filter((item) => item.video_url && !images.some((image) => image.id === item.id))
      .map((item) => ({ ...item, media_type: 'video' as const })),
  ];

  if (!items.length) return null;

  const { gallerySizePx = 280, gallerySpeed, galleryFit } = display;
  const cardSizePx = Number.isFinite(gallerySizePx)
    ? Math.min(1200, Math.max(200, Math.round(gallerySizePx)))
    : 280;
  const speedDuration = {
    slow: 1,
    normal: 0.5,
    fast: 0.2,
  }[gallerySpeed ?? 'normal'];
  const objectFit = galleryFit === 'cover' ? 'cover' : 'contain';

  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const current = items[currentIndex];

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const goPrev = () => {
    setCurrentIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
  };

  const goNext = () => {
    setCurrentIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
  };

  return (
    <>
      <section className="relative overflow-hidden bg-slate-950 py-16 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-[110px]" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-violet-600/15 blur-[110px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4">
          <p className="mb-3 text-center text-sm font-bold uppercase tracking-[0.3em] text-cyan-300">المعرض</p>
          <h2 className="mb-2 text-center text-2xl font-black text-white md:text-3xl">معرض الصور والفيديو</h2>
          <p className="mx-auto mb-8 max-w-xl text-center text-sm text-slate-400">اضغط على صورة أو معاينة فيديو لعرضها بالحجم الكامل وتشغيل الفيديو.</p>
          <div className="grid auto-rows-[112px] grid-cols-2 gap-2.5 sm:auto-rows-[132px] md:grid-cols-4">
            {items.map((item, index) => {
              const isExpanded = expandedId === item.id;
              const src = item.image_url ?? null;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  layout
                  onClick={() => item.media_type === 'video' ? openLightbox(index) : toggleExpand(item.id)}
                  onDoubleClick={() => openLightbox(index)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={item.media_type === 'video' ? undefined : isExpanded}
                  aria-label={item.media_type === 'video' ? `تشغيل الفيديو: ${item.title}` : item.title}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
                  className={`group relative cursor-pointer overflow-hidden rounded-xl border text-right transition-colors ${isExpanded ? 'col-span-2 row-span-2 border-cyan-300/50' : 'border-white/10 hover:border-cyan-400/30'} bg-slate-900`}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={item.title}
                      loading="lazy"
                      className={`h-full w-full transition duration-500 ${objectFit === 'cover' ? 'object-cover' : 'object-contain bg-slate-950'} ${isExpanded ? 'scale-100' : 'group-hover:scale-105'}`}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-slate-900 text-slate-400"><Play className="h-8 w-8" aria-hidden="true" /></span>
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <span className={`absolute bottom-2 right-2 font-semibold text-white ${isExpanded ? 'text-sm' : 'text-[10px] sm:text-xs'}`}>{item.title}</span>
                  {item.media_type === 'video' && src && (
                    <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white"><Play className="h-4 w-4" aria-hidden="true" /></span>
                  )}
                  <span role="button" tabIndex={0} aria-label={`تكبير ${item.title} وفتحها بالحجم الكامل`} onClick={(e) => { e.stopPropagation(); openLightbox(index); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); openLightbox(index); } }} className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><Maximize2 className="h-4 w-4" aria-hidden="true" /></span>
                  {isExpanded && (<span className="absolute left-2 bottom-2 rounded-full bg-black/45 px-2 py-1 text-[9px] text-white">اضغط لإعادة الترتيب</span>)}
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 sm:p-8"
            onClick={() => setOpen(false)}
          >
            <button type="button" aria-label="إغلاق" onClick={(event) => { event.stopPropagation(); setOpen(false); }} className="absolute top-4 right-4 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white transition-colors"><X className="w-5 h-5" /></button>
            <div className="relative w-full max-w-full max-h-[90vh] flex items-center justify-center" onClick={(event) => event.stopPropagation()}>
              {items.length > 1 && (
                <button type="button" aria-label="السابقة" onClick={(event) => { event.stopPropagation(); goPrev(); }} disabled={currentIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              )}
              <motion.div key={current?.id ?? ''} layout layoutId={current?.id ?? ''} className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl">
                {current?.media_type === 'video' && current.video_url ? (
                  <video src={current.video_url} controls autoPlay playsInline className="w-full h-full object-contain rounded-lg" />
                ) : current?.image_url ? (
                  <img src={current.image_url} alt={current.title} className="w-full h-full object-contain rounded-lg" />
                ) : null}
              </motion.div>
              {items.length > 1 && (
                <button type="button" aria-label="التالية" onClick={(event) => { event.stopPropagation(); goNext(); }} disabled={currentIndex === items.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"><ChevronRight className="w-5 h-5" /></button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
