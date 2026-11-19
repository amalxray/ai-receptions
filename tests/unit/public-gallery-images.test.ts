import { describe, expect, it } from 'vitest';
import { publicGalleryImageSrc, publicGalleryImageSrcSet } from '@/lib/media/publicGalleryImages';

describe('public gallery responsive image URLs', () => {
  it('builds cached Vercel image variants for the 400, 800, and 1200 pixel candidates', () => {
    const original = 'https://project.supabase.co/storage/v1/object/public/clinic-public-media/clinic/a/gallery/image.jpg';
    const srcSet = publicGalleryImageSrcSet(original);

    expect(publicGalleryImageSrc(original, 400)).toContain('&w=400&q=75');
    expect(srcSet).toContain('&w=400&q=75 400w');
    expect(srcSet).toContain('&w=800&q=75 800w');
    expect(srcSet).toContain('&w=1200&q=75 1200w');
  });

  it('leaves reviewed local WebP mirrors untouched', () => {
    const local = '/images/supabase/clinic-public-media/gallery/image.webp';
    expect(publicGalleryImageSrc(local, 400)).toBe(local);
    expect(publicGalleryImageSrcSet(local)).toBeUndefined();
  });

  it('optimizes the approved public gallery sources and leaves other hosts unchanged', () => {
    const unsplash = 'https://images.unsplash.com/photo-1?auto=format&w=1200';
    const unrelated = 'https://example.com/public-image.png';

    expect(publicGalleryImageSrc(unsplash, 800)).toContain('/_next/image?url=');
    expect(publicGalleryImageSrc(unrelated, 800)).toBe(unrelated);
    expect(publicGalleryImageSrcSet(unrelated)).toBeUndefined();
  });
});
