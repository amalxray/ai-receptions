'use client';

import { useCallback, useEffect } from 'react';

export type LightboxMedia = {
  id: string;
  media_type: 'image' | 'video';
  public_url: string;
  title: string | null;
  caption?: string | null;
  alt_text: string | null;
};

/**
 * PUBLIC GALLERY LIGHTBOX — full-screen viewer for the public gallery.
 * RTL-aware: ArrowRight steps toward the start (previous), ArrowLeft forward,
 * matching the right-to-left grid flow. Escape / backdrop click closes.
 * Body scroll is locked while open.
 */
export default function PublicGalleryLightbox({
  media,
  index,
  onClose,
  onNavigate,
}: {
  media: LightboxMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const current = media[index];

  const goPrev = useCallback(
    () => onNavigate(Math.max(0, index - 1)),
    [index, onNavigate]
  );
  const goNext = useCallback(
    () => onNavigate(Math.min(media.length - 1, index + 1)),
    [index, media.length, onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // RTL flow: right arrow = previous item, left arrow = next item.
      else if (e.key === 'ArrowRight') goPrev();
      else if (e.key === 'ArrowLeft') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose]);

  // Lock body scroll while the lightbox is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={current.title || current.alt_text || 'عارض الوسائط'}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white transition hover:bg-white/20"
      >
        ×
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        disabled={index === 0}
        aria-label="السابق"
        className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-4xl leading-none text-white transition hover:bg-white/20 disabled:opacity-30 sm:right-6"
      >
        ›
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goNext();
        }}
        disabled={index === media.length - 1}
        aria-label="التالي"
        className="absolute left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-4xl leading-none text-white transition hover:bg-white/20 disabled:opacity-30 sm:left-6"
      >
        ‹
      </button>

      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {current.media_type === 'video' ? (
          <video
            src={current.public_url}
            controls
            autoPlay
            className="max-h-[80vh] max-w-[90vw] rounded-xl bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.public_url}
            alt={current.alt_text || current.title || 'صورة'}
            className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
          />
        )}
        <p className="max-w-[90vw] truncate text-center text-sm text-white/80">
          {index + 1} / {media.length}
          {current.title ? ` · ${current.title}` : ''}
          {current.caption ? ` — ${current.caption}` : ''}
        </p>
      </div>
    </div>
  );
}
