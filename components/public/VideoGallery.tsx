'use client';

import { useEffect, useState } from 'react';

type VideoGalleryItem = {
  id: string;
  public_url: string;
  title: string | null;
  caption: string | null;
  alt_text: string | null;
};

export default function VideoGallery({ items, title = 'شروحات طبية' }: { items: VideoGalleryItem[]; title?: string }) {
  const [activeVideo, setActiveVideo] = useState<VideoGalleryItem | null>(null);

  useEffect(() => {
    if (!activeVideo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveVideo(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeVideo]);

  if (items.length === 0) return null;

  return (
    <section id="video-gallery" className="mx-auto w-full max-w-7xl px-4 py-12">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">اختر فيديو لمشاهدته — التشغيل يبدأ بطلبك فقط</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveVideo(item)}
            aria-label={`تشغيل ${item.title || `الفيديو ${index + 1}`}`}
            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
          >
            <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950">
              <span aria-hidden="true" className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, #67e8f9, transparent 45%)' }} />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/15 text-2xl text-white shadow-lg backdrop-blur transition group-hover:scale-110" aria-hidden="true">▶</span>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">فيديو</span>
            </span>
            <span className="block p-4">
              <span className="block font-semibold text-slate-900">{item.title || `فيديو ${index + 1}`}</span>
              {item.caption && <span className="mt-1 block text-sm leading-6 text-slate-600">{item.caption}</span>}
            </span>
          </button>
        ))}
      </div>

      {activeVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveVideo(null); }}
        >
          <div role="dialog" aria-modal="true" aria-label={activeVideo.title || 'مشغل الفيديو'} className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl">
            <button
              type="button"
              onClick={() => setActiveVideo(null)}
              aria-label="إغلاق مشغل الفيديو"
              className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-2xl text-white transition hover:bg-black"
            >
              ×
            </button>
            <video
              key={activeVideo.id}
              src={activeVideo.public_url}
              controls
              playsInline
              preload="metadata"
              aria-label={activeVideo.alt_text || activeVideo.title || 'فيديو من المركز'}
              className="max-h-[75vh] w-full bg-black"
            />
            {(activeVideo.title || activeVideo.caption) && (
              <div className="p-5 text-white" dir="rtl">
                {activeVideo.title && <h3 className="text-lg font-bold">{activeVideo.title}</h3>}
                {activeVideo.caption && <p className="mt-1 text-sm leading-6 text-slate-300">{activeVideo.caption}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
