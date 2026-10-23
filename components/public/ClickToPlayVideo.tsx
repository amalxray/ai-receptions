'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

export const PUBLIC_VIDEO_POSTER = '/images/public-video-poster.svg';

export function VideoPoster({
  title,
  className = 'aspect-video w-full',
}: {
  title?: string;
  className?: string;
}) {
  return (
    <div className={`relative isolate overflow-hidden bg-slate-900 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PUBLIC_VIDEO_POSTER}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full border border-white/70 bg-cyan-500/90 text-white shadow-xl transition group-hover:scale-105">
          <Play className="mr-0.5 h-7 w-7 fill-current" aria-hidden="true" />
        </span>
      </span>
      {title && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-4 pb-3 pt-8 text-right text-sm font-semibold text-white">
          {title}
        </span>
      )}
    </div>
  );
}

export default function ClickToPlayVideo({
  src,
  title,
  className = 'aspect-video w-full',
}: {
  src: string;
  title?: string;
  className?: string;
}) {
  const [activated, setActivated] = useState(false);

  return (
    <div className={`relative isolate overflow-hidden bg-slate-950 ${className}`}>
      {activated ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={src}
          controls
          autoPlay
          playsInline
          preload="none"
          poster={PUBLIC_VIDEO_POSTER}
          aria-label={title ? `فيديو: ${title}` : 'فيديو من معرض العيادة'}
          className="h-full w-full bg-slate-950 object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActivated(true);
          }}
          aria-label={title ? `تشغيل الفيديو: ${title}` : 'تشغيل الفيديو'}
          className="group absolute inset-0 h-full w-full"
        >
          <VideoPoster title={title} className="h-full w-full" />
        </button>
      )}
    </div>
  );
}
