'use client';

import { BlurFade } from '@/components/ui/blur-fade';

export default function GallerySection({ images }: { images: Array<Record<string, unknown>> }) {
  if (!images?.length) return null;
  return (
    <section className="py-20" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="mx-auto max-w-5xl px-4">
        <BlurFade inView>
          <h2 className="mb-12 text-center text-3xl md:text-4xl font-black text-white">📸 معرض الصور</h2>
        </BlurFade>
        <div className="flex snap-x gap-4 overflow-x-auto pb-4">
          {images.map((img, i) => (
            <BlurFade key={String(img.id)} delay={i * 0.08} inView>
              <figure className="w-64 shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(img.image_url)} alt={String(img.title ?? '')} loading="lazy" className="h-48 w-full rounded-2xl object-cover transition-transform duration-500 hover:scale-105" />
                <figcaption className="mt-2 text-center text-xs text-slate-400">{String(img.title ?? '')}</figcaption>
              </figure>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
