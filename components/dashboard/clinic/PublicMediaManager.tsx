'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClinicContext } from '@/lib/useClinicContext';

/**
 * CLINIC PUBLIC MEDIA MANAGER — owner upload/preview/reorder/visibility/delete.
 *
 * Everything is tenant-scoped server-side: POST/PATCH/DELETE run behind
 * authorizeClinicRequest (ADMIN_ROLES) and the storage path is built from the
 * authenticated clinic_id. Row metadata lives in clinic_public_media (RLS).
 *
 * Phase 2 enhancements: category tagging (clinic/team/equipment/cases/other),
 * drag & drop reordering (@dnd-kit, with keyboard + up/down fallback), and
 * bulk delete with explicit selection.
 */

type MediaCategory = 'clinic' | 'team' | 'equipment' | 'cases' | 'other';

const CATEGORIES: { value: MediaCategory; label: string; icon: string }[] = [
  { value: 'clinic', label: 'العيادة', icon: '🏥' },
  { value: 'team', label: 'الطاقم', icon: '👥' },
  { value: 'equipment', label: 'المعدات', icon: '🩺' },
  { value: 'cases', label: 'حالات', icon: '📋' },
  { value: 'other', label: 'أخرى', icon: '📁' },
];

const categoryLabel = (value: string | null | undefined) =>
  CATEGORIES.find((c) => c.value === value)?.label ?? 'أخرى';

type MediaItem = {
  id: string;
  media_type: 'image' | 'video';
  public_url: string;
  title: string | null;
  caption: string | null;
  alt_text: string | null;
  category: MediaCategory;
  display_order: number;
  enabled: boolean;
};

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
const SIZE_LIMIT_MB = 25;

export default function PublicMediaManager() {
  const { clinicId, authHeaders } = useClinicContext();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [uploadCategory, setUploadCategory] = useState<MediaCategory>('clinic');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/public-media?clinic_id=${encodeURIComponent(clinicId)}`,
        { headers }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `فشل التحميل (${res.status})`);
      }
      const { data } = (await res.json()) as { data: MediaItem[] };
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الوسائط');
    } finally {
      setLoading(false);
    }
  }, [clinicId, authHeaders]);

  useEffect(() => {
    if (clinicId) void load();
  }, [clinicId, load]);

  const upload = async (file: File) => {
    if (!clinicId) return;
    if (file.size > SIZE_LIMIT_MB * 1024 * 1024) {
      setError(`حجم الملف يتجاوز الحد الأقصى (${SIZE_LIMIT_MB}MB)`);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append('file', file);
      if (title.trim()) form.append('title', title.trim());
      if (altText.trim()) form.append('alt_text', altText.trim());
      form.append('category', uploadCategory);
      const res = await fetch(
        `/api/clinic/public-media?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'POST', headers, body: form }
      );
      const body = (await res.json().catch(() => null)) as { data?: MediaItem; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `فشل الرفع (${res.status})`);
      setTitle('');
      setAltText('');
      setUploadCategory('clinic');
      setSuccess('تم رفع الملف بنجاح');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع الملف');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, patchBody: Record<string, unknown>) => {
    if (!clinicId) return;
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/public-media/${id}?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody) }
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'فشل الحفظ');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ التغيير');
    }
  };

  const remove = async (id: string) => {
    if (!clinicId || !window.confirm('حذف هذا الملف نهائيًا من الصفحة العامة؟')) return;
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/clinic/public-media/${id}?clinic_id=${encodeURIComponent(clinicId)}`,
        { method: 'DELETE', headers }
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'فشل الحذف');
      setSuccess('تم حذف الملف');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الملف');
    }
  };

  const move = (id: string, dir: -1 | 1) => {
    if (!items) return;
    const idx = items.findIndex((i) => i.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= items.length) return;
    void patch(id, { display_order: items[target].display_order });
    void patch(items[target].id, { display_order: items[idx].display_order });
  };

  // ---- Drag & drop reordering (@dnd-kit) ------------------------------------
  // Optimistically reorder locally, then persist sequential display_order for
  // every row whose index changed (avoids the classic two-row swap race).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !items) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    next.forEach((item, index) => {
      if (item.display_order !== index) void patch(item.id, { display_order: index });
    });
  };

  // ---- Bulk selection + delete ----------------------------------------------
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!items) return;
    setSelectedIds((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  };

  const handleBulkDelete = async () => {
    if (!clinicId || selectedIds.size === 0) return;
    if (!window.confirm(`حذف ${selectedIds.size} ملفًا نهائيًا من الصفحة العامة؟`)) return;
    setBulkBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await authHeaders();
      let failed = 0;
      // Array.from avoids downlevelIteration requirements for Set spread.
      for (const id of Array.from(selectedIds)) {
        const res = await fetch(
          `/api/clinic/public-media/${id}?clinic_id=${encodeURIComponent(clinicId)}`,
          { method: 'DELETE', headers }
        );
        if (!res.ok) failed += 1;
      }
      setSelectedIds(new Set());
      setSuccess(failed > 0 ? `تم الحذف مع فشل ${failed} ملفًا` : 'تم حذف الملفات المحددة');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف الجماعي');
    } finally {
      setBulkBusy(false);
    }
  };

  /** Sortable gallery card — the drag handle covers the media area only, so
   * the action buttons and category select below stay fully interactive. */
  function SortableMediaCard({ item, index }: { item: MediaItem; index: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
    });
    const isSelected = selectedIds.has(item.id);
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
          isDragging
            ? 'z-10 scale-[1.02] border-cyan-400 opacity-90'
            : isSelected
              ? 'border-cyan-500 ring-2 ring-cyan-200'
              : 'border-slate-200'
        }`}
      >
        <div
          {...attributes}
          {...listeners}
          className={`relative aspect-[4/3] w-full cursor-grab touch-none bg-slate-100 active:cursor-grabbing ${isDragging ? 'opacity-70' : ''}`}
          title="اسحب لإعادة الترتيب"
        >
          {item.media_type === 'video' ? (
            <video src={item.public_url} preload="none" tabIndex={-1} className="pointer-events-none h-full w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.public_url} alt={item.alt_text || item.title || 'صورة'} className="pointer-events-none h-full w-full object-cover" />
          )}
          <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            ⠿ {index + 1}
          </span>
          <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {categoryLabel(item.category)}
          </span>
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-slate-700">{item.title || 'بدون عنوان'}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {item.media_type === 'image' ? 'صورة' : 'فيديو'} · الشرائح {index + 1}
          </p>
          <label className="mt-2 block">
            <span className="sr-only">تصنيف</span>
            <select
              value={item.category ?? 'other'}
              onChange={(e) => void patch(item.id, { category: e.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(item.id)}
                className="h-3.5 w-3.5 accent-cyan-600"
              />
              تحديد
            </label>
            <button type="button" onClick={() => move(item.id, -1)} disabled={index === 0} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              لأعلى
            </button>
            <button type="button" onClick={() => move(item.id, 1)} disabled={index === items!.length - 1} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              لأسفل
            </button>
            <button
              type="button"
              onClick={() => void patch(item.id, { enabled: !item.enabled })}
              className={`rounded-md px-2 py-1 ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {item.enabled ? 'ظاهر' : 'مخفي'}
            </button>
            <button type="button" onClick={() => void remove(item.id)} className="rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50">
              حذف
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800">معرض الصور والوسائط</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        ارفع صورًا وفيديو تظهر في «معرض الأعمال» بالصفحة العامة. الحد الأقصى {SIZE_LIMIT_MB}MB لكل ملف (JPG/PNG/WebP/GIF — MP4/WebM/MOV).
      </p>

      {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">عنوان (اختياري)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="مثال: استقبال العيادة"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">نص بديل للصورة (اختياري)</span>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="وصف قصير للصورة"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">التصنيف</span>
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value as MediaCategory)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50">
        {busy ? 'جارٍ الرفع…' : '⬆ ارفع صورة أو فيديو'}
        <input
          type="file"
          accept={ACCEPT}
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </label>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">جارٍ التحميل…</p>
      ) : items && items.length > 0 ? (
        <>
          {/* Bulk selection toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-cyan-600"
              />
              تحديد الكل ({selectedIds.size}/{items.length})
            </label>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              disabled={selectedIds.size === 0 || bulkBusy}
              className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkBusy ? 'جارٍ الحذف…' : `🗑 حذف المحدد${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, index) => (
                  <SortableMediaCard key={item.id} item={item} index={index} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <p className="mt-2 text-xs text-slate-400">
            💡 اسحب صورة لإعادة ترتيبها، أو استخدم أزرار «لأعلى/لأسفل». الترتيب يُحفظ تلقائيًا.
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          لا توجد وسائط بعد. ارفع صورًا أو فيديو لتظهر في معرض الصفحة العامة.
        </p>
      )}
    </section>
  );
}