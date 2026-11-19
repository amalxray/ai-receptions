const PUBLIC_GALLERY_WIDTHS = [400, 800, 1200] as const;

export function publicGalleryImageSrc(src: string, width: (typeof PUBLIC_GALLERY_WIDTHS)[number]): string {
  if (src.startsWith('/')) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

export function publicGalleryImageSrcSet(src: string): string | undefined {
  if (src.startsWith('/')) return undefined;
  return PUBLIC_GALLERY_WIDTHS
    .map((width) => `${publicGalleryImageSrc(src, width)} ${width}w`)
    .join(', ');
}
