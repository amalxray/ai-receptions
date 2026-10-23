'use client';

/**
 * PUBLIC GALLERY — MorphingDialog grid. Each item springs open from its own
 * thumbnail into a full card (large media + title + caption) and springs back
 * on close (framer-motion shared layout). One dialog per item; images morph
 * via layoutId, videos render a plain preview/controls (no shared-layout morph).
 */

import {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogClose,
  MorphingDialogContainer,
} from '@/components/ui/morphing-dialog';
import ClickToPlayVideo, { VideoPoster } from '@/components/public/ClickToPlayVideo';

export type LightboxMedia = {
  id: string;
  media_type: 'image' | 'video';
  public_url: string;
  title: string | null;
  caption?: string | null;
  alt_text: string | null;
};

export default function PublicGalleryLightbox({
  media,
  gapClassName = 'gap-4',
}: {
  media: LightboxMedia[];
  /** Gallery spacing control (owner display.gallery_spacing → approved classes). */
  gapClassName?: string;
}) {
  if (!media.length) return null;

  return (
    <div className={`flex snap-x snap-mandatory overflow-x-auto pb-4 scrollbar-hide ${gapClassName}`}>
      {media.map((item) => (
        <MorphingDialog key={item.id} transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
          <MorphingDialogTrigger
            style={{ borderRadius: '16px' }}
            className="group relative flex-none snap-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm w-[85vw] md:w-[400px] aspect-[4/3]"
          >
            {item.media_type === 'video' ? (
              <VideoPoster title={item.title ?? undefined} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <MorphingDialogImage
                src={item.public_url}
                alt={item.alt_text || item.title || 'صورة من المعرض'}
                className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
            )}
            {item.title && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
                <p className="text-sm font-semibold text-white">{item.title}</p>
              </div>
            )}
            {item.media_type === 'video' && (
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                فيديو
              </span>
            )}
          </MorphingDialogTrigger>

          <MorphingDialogContainer>
            <MorphingDialogContent
              style={{ borderRadius: '16px' }}
              className="relative h-auto w-[90vw] max-w-2xl border border-slate-100 bg-white"
            >
              <div className="p-4">
                {item.media_type === 'video' ? (
                  <ClickToPlayVideo
                    src={item.public_url}
                    title={item.title ?? undefined}
                    className="mx-auto aspect-video max-h-[80vh] w-full max-w-2xl rounded-lg"
                  />
                ) : (
                  <MorphingDialogImage
                    src={item.public_url}
                    alt={item.alt_text || item.title || 'صورة من المعرض'}
                    className="h-auto w-full rounded-lg"
                  />
                )}
                {(item.title || item.caption) && (
                  <div className="mt-4">
                    {item.title && <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>}
                    {item.caption && <p className="mt-1 text-sm text-slate-600">{item.caption}</p>}
                  </div>
                )}
              </div>
              <MorphingDialogClose className="absolute left-4 top-4 rounded-full bg-black/50 p-2 text-2xl leading-none text-white" />
            </MorphingDialogContent>
          </MorphingDialogContainer>
        </MorphingDialog>
      ))}
    </div>
  );
}
