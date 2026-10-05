import { describe, expect, it } from 'vitest';
import { reorderGalleryItems } from '../lib/galleryOrder';

describe('reorderGalleryItems', () => {
  it('moves the dragged item before the target item', () => {
    const items = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
      { id: 'd', sort_order: 3 },
    ];

    expect(reorderGalleryItems(items, 'a', 'd')).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'c', sort_order: 1 },
      { id: 'd', sort_order: 2 },
      { id: 'a', sort_order: 3 },
    ]);
  });

  it('keeps the order when the dragged item is already before the target', () => {
    const items = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ];

    expect(reorderGalleryItems(items, 'b', 'a')).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
  });
});
