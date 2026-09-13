'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type GalleryItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string | null;
  tags: string[] | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

const CATEGORY_OPTIONS = ['', 'عروض', 'معدات', 'نصائح', 'بيئة العيادة', 'أخرى'];

/**
 * /admin/gallery — platform image gallery (owner).
 * Upload via /api/admin/upload (storage) + POST /api/admin/gallery (row).
 * Drag&drop + file picker, filters, search, inline edit/delete.
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gallery');
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
        body: JSON.stringify({ title, image_url: upJson.data.url, category: null, tags: [], sort_order: items.length, is_active: true }),
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
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">لا توجد صور — ارفع أول صورة من الزر أعلاه.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <div key={it.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image_url} alt={it.title} loading="lazy" className="h-40 w-full object-cover" />
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-slate-100">{it.title}</p>
                <p className="text-xs text-slate-500">{it.category || 'بدون تصنيف'}{(it.tags ?? []).length > 0 ? ` · ${it.tags!.join('، ')}` : ''}{it.is_active ? '' : ' · 🔴 مخفي'}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => { setEditing(it); setEditTitle(it.title); setEditCategory(it.category ?? ''); setEditTags((it.tags ?? []).join('، ')); setEditActive(it.is_active); setEditUrl(it.image_url); }} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">✏️ تعديل</button>
                  <button type="button" onClick={() => void remove(it.id)} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25">🗑️ حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
