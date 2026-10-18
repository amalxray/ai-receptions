'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Play, ChevronLeft, ChevronRight } from 'lucide-react';

type GalleryItem = {
  id: string;
  title: string;
  image_url?: string | null;
  video_url?: string | null;
  category?: string | null;
  media_type?: 'image' | 'video' | null;
};

type GalleryGridProps = {
  images: GalleryItem[];
  videos: GalleryItem[];
};

export default function GalleryGrid({ images = [], videos = [] }: GalleryGridProps) {
  const items: GalleryItem[] = [
    ...images.map((item) => ({ ...item, media_type: 'image' as const })),
    ...videos.map((item) => ({ ...item, media_type: 'video' as const })),
  ];

  if (!items.length) return null;

  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = items[currentIndex];

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setOpen(true);
  };

  const goPrev = () =>
    setCurrentIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
  const goNext = () =>
    setCurrentIndex((i) => (i >= items.length - 1 ? 0 : i + 1));

  return (
    <>
      <section className="py-12 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900 md:text-3xl">
            معرض الصور والفيديو
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.02, y: -5 }}
                onClick={() => openLightbox(index)}
                className="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-900 border border-white/10"
              >
                <div className="w-full h-full aspect-[4/3]">
                  {item.media_type === 'video' && item.video_url ? (
                    <>
                      <video
                        src={item.video_url}
                        muted
                        playsInline
                        poster={item.image_url ?? undefined}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="تشغيل الفيديو"
                        onClick={(event) => {
                          event.stopPropagation();
                          openLightbox(index);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 transition-colors"
                      >
                        <Play className="w-10 h-10 text-white" />
                      </button>
                    </>
                  ) : item.image_url ? (
                    <motion.img
                      layout
                      layoutId={item.id}
                      src={item.image_url}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end gap-2 px-4 pb-4"
                  >
                    <h3 className="text-white font-semibold text-lg leading-tight">
                      {item.title}
                    </h3>
                    {item.category && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white">
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
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
            <button
              type="button"
              aria-label="إغلاق"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
              className="absolute top-4 right-4 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="relative w-full max-w-full max-h-[90vh] flex items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="السابقة"
                  onClick={(event) => {
                    event.stopPropagation();
                    goPrev();
                  }}
                  disabled={currentIndex === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <motion.div
                key={current?.id ?? ''}
                layout
                layoutId={current?.id ?? ''}
                className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
              >
                {current?.media_type === 'video' && current.video_url ? (
                  <video
                    src={current.video_url}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : current?.image_url ? (
                  <img
                    src={current.image_url}
                    alt={current.title}
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : null}
              </motion.div>

              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="التالية"
                  onClick={(event) => {
                    event.stopPropagation();
                    goNext();
                  }}
                  disabled={currentIndex === items.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
