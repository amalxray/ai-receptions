'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { reorderGalleryItems } from '@/lib/galleryOrder';

type GalleryItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string | null;
  tags: string[] | null;
  scope?: 'main_site' | 'ask_page';
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

const CATEGORY_OPTIONS = ['', 'عروض', 'معدات', 'نصائح', 'بيئة العيادة', 'أخرى'];

function SortableGalleryCard({
  item,
  selectedIds,
  onToggleSelect,
  onEdit,
  onRemove,
}: {
  item: GalleryItem;
  selectedIds: string[];
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (item: GalleryItem) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50"
    >
      <div className="relative">
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="سحب لإعادة الترتيب"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-300 shadow-lg hover:border-violet-400 hover:text-violet-300"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <input
            type="checkbox"
            checked={selectedIds.includes(item.id)}
            onChange={(e) => onToggleSelect(item.id, e.target.checked)}
            className="h-5 w-5 cursor-pointer rounded accent-violet-500"
          />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.title} loading="lazy" className="h-40 w-full object-cover" />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
        <p className="text-xs text-slate-500">{item.category || 'بدون تصنيف'}{(item.tags ?? []).length > 0 ? ` · ${item.tags!.join('، ')}` : ''}{item.is_active ? '' : ' · 🔴 مخفي'}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => onEdit(item)} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">✏️ تعديل</button>
          <button type="button" onClick={() => onRemove(item.id)} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25">🗑️ حذف</button>
        </div>
      </div>
    </div>
  );
}

/**
 * /admin/gallery — platform image gallery (owner).
 * Upload via /api/admin/upload (storage) + POST /api/admin/gallery (row).
 * Drag&drop + file picker, filters, search, inline edit/delete.
 * Multi-select & bulk delete support.
 */
export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editUrl, setEditUrl] = useState('');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gallery?scope=main_site');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      setItems((json.data ?? []) as GalleryItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const uploadAndCreate = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const upJson = await up.json();
      if (!up.ok) throw new Error(upJson.error ?? 'فشل رفع الصورة');
      const title = (file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') || 'صورة').slice(0, 80);
      const res = await fetch('/api/admin/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, image_url: upJson.data.url, category: null, tags: [], scope: 'main_site', sort_order: items.length, is_active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setNotice('✓ أُضيفت الصورة');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الرفع');
    } finally {
      setBusy(false);
    }
  };

  const applyEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/gallery/' + editing.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || editing.title,
          category: editCategory.trim() || null,
          tags: editTags.split(/[،,]/).map((t) => t.trim()).filter(Boolean),
          is_active: editActive,
          image_url: editUrl.trim() || editing.image_url,
          scope: editing.scope ?? 'main_site',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setNotice('✓ تم التحديث');
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحديث');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذه الصورة نهائياً؟')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/gallery/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      setNotice('✓ حُذفت الصورة');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`هل تريد حذف ${selectedIds.length} صورة نهائياً؟`)) return;
    setBusy(true);
    try {
      const promises = selectedIds.map(id => 
        fetch('/api/admin/gallery/' + id, { method: 'DELETE' })
      );
      await Promise.all(promises);
      setNotice(`✓ تم حذف ${selectedIds.length} صورة`);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف الجماعي');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(it => it.id));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((current) => reorderGalleryItems(current, String(active.id), String(over.id)));
  };

  const saveOrder = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await Promise.all(
        items.map((item, index) =>
          fetch('/api/admin/gallery/' + item.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: index, scope: item.scope ?? 'main_site' }),
          }),
        ),
      );
      setNotice('✓ تم حفظ ترتيب المعرض');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل حفظ الترتيب');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => !category || (it.category ?? '') === category)
      .filter((it) => !q || it.title.toLowerCase().includes(q) || (it.category ?? '').toLowerCase().includes(q) || (it.tags ?? []).join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [items, query, category]);

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">🖼️ معرض الصور</h2>
          <p className="mt-1 text-sm text-slate-400">صور المنصة — تُستخدم في المقالات وصفحة /ask.</p>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void uploadAndCreate(f); }}
          className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${dragging ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400' : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'}`}
        >
          <input
            type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); void Promise.all(fs.map((f) => uploadAndCreate(f))); e.target.value = ''; }}
          />
          {dragging ? 'أفلت الصورة هنا' : `➕ رفع صورة${busy ? '...' : ''}`}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 بحث..." className="w-56 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-violet-500/70" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c === '' ? 'كل التصنيفات' : c}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} من {items.length}</span>

        {items.length > 1 && (
          <button
            type="button"
            onClick={() => void saveOrder()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            حفظ ترتيب المعرض
          </button>
        )}
        
        {filtered.length > 0 && (
          <>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            >
              {selectedIds.length === filtered.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
            
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => void bulkDelete()}
                disabled={busy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                🗑️ حذف المحدد ({selectedIds.length})
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">لا توجد صور — ارفع أول صورة من الزر أعلاه.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((it) => it.id)} strategy={rectSortingStrategy}>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((it) => (
                <SortableGalleryCard
                  key={it.id}
                  item={it}
                  selectedIds={selectedIds}
                  onToggleSelect={(id, checked) => {
                    if (checked) {
                      setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
                    } else {
                      setSelectedIds((current) => current.filter((itemId) => itemId !== id));
                    }
                  }}
                  onEdit={(item) => {
                    setEditing(item);
                    setEditTitle(item.title);
                    setEditCategory(item.category ?? '');
                    setEditTags((item.tags ?? []).join('، '));
                    setEditActive(item.is_active);
                    setEditUrl(item.image_url);
                  }}
                  onRemove={(id) => void remove(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">✏️ تعديل الصورة</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editUrl} alt="" className="mt-3 h-32 w-full rounded-xl object-cover" />
            <div className="mt-3 space-y-2">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="العنوان" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} dir="ltr" placeholder="رابط الصورة" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c === '' ? 'بدون تصنيف' : c}</option>)}
              </select>
              <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="وسوم مفصولة بفاصلة" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="accent-violet-500" />
                مفعّلة
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void applyEdit()} disabled={busy} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">{busy ? 'جارٍ الحفظ...' : '💾 حفظ'}</button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}