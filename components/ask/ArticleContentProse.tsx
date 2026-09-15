'use client';

import { useEffect, useRef, useState } from 'react';
import ImageMorphViewer, { type ViewingImage } from '@/components/ui/ImageMorphViewer';

/**
 * ARTICLE CONTENT PROSE — renders trusted admin-authored HTML (TipTap) and
 * upgrades every <img> inside it to a morphing full-screen viewer: clicking
 * an image grows it from its position into a centered spring viewer.
 * Root-cause companion fix for "المقالات لا تعرض المحتوى": content itself is
 * rendered verbatim here; the actual loss happened in the admin editor, which
 * never loaded existing content into TipTap (see app/admin/articles/page.tsx).
 */
export default function ArticleContentProse({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewing, setViewing] = useState<ViewingImage | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.tagName !== 'IMG') return;
      const img = target as HTMLImageElement;
      event.preventDefault();
      setViewing({
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        rect: img.getBoundingClientRect(),
      });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [html]);

  return (
    <>
      <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />
      <ImageMorphViewer viewing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}