import { arrayMove } from '@dnd-kit/sortable';

export function reorderGalleryItems<T extends { id: string; sort_order?: number }>(
  items: T[],
  activeId: string,
  overId: string,
): T[] {
  if (activeId === overId) return items;

  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);

  if (oldIndex < 0 || newIndex < 0) return items;

  return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
    ...item,
    sort_order: index,
  }));
}
