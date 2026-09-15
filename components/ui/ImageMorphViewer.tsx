'use client';

/**
 * IMAGE MORPH VIEWER — rect-based morph overlay for images discovered inside
 * free-form HTML (article content) or behind on-demand signed URLs (dashboard
 * medical files). The clicked element's bounding rect is captured and the
 * full-size image springs from that exact rect into a centered viewer.
 * Escape / backdrop click closes; body scroll is locked while open.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type MorphRect = { top: number; left: number; width: number; height: number };
export type ViewingImage = { src: string; alt: string; rect: MorphRect };

export default function ImageMorphViewer({
  viewing,
  onClose,
}: {
  viewing: ViewingImage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!viewing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [viewing, onClose]);

  return (
    <AnimatePresence>
      {viewing && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={viewing.alt || 'عرض الصورة'}
          onClick={onClose}
        >
          <motion.img
            src={viewing.src}
            alt={viewing.alt}
            className="object-contain shadow-2xl"
            style={{ position: 'fixed', objectFit: 'contain' }}
            initial={{
              top: viewing.rect.top,
              left: viewing.rect.left,
              width: viewing.rect.width,
              height: viewing.rect.height,
              borderRadius: 12,
            }}
            animate={{
              // Bounded centered box (letterboxed by object-contain) —
              // deterministic in RTL and on any viewport size.
              top: '6vh',
              left: '4vw',
              width: '92vw',
              height: '88vh',
              borderRadius: 16,
            }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white transition hover:bg-white/20"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}