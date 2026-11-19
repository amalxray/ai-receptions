const PUBLIC_GALLERY_WIDTHS = [400, 800, 1200] as const;

function canOptimizePublicImage(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:') return false;
    return (
      (url.hostname.endsWith('.supabase.co') &&
        url.pathname.startsWith('/storage/v1/object/public/clinic-public-media/')) ||
      url.hostname === 'images.unsplash.com'
    );
  } catch {
    return false;
  }
}

export function publicGalleryImageSrc(src: string, width: (typeof PUBLIC_GALLERY_WIDTHS)[number]): string {
  if (src.startsWith('/') || !canOptimizePublicImage(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

export function publicGalleryImageSrcSet(src: string): string | undefined {
  if (src.startsWith('/') || !canOptimizePublicImage(src)) return undefined;
  return PUBLIC_GALLERY_WIDTHS
    .map((width) => `${publicGalleryImageSrc(src, width)} ${width}w`)
    .join(', ');
}
