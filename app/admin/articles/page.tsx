'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Underline } from '@tiptap/extension-underline';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Heading } from '@tiptap/extension-heading';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Blockquote } from '@tiptap/extension-blockquote';
import { BulletList } from '@tiptap/extension-bullet-list';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { ListItem } from '@tiptap/extension-list-item';

type Article = {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  content: string;
  category: string | null;
  tags: string[] | null;
  status: 'draft' | 'published' | 'archived';
  is_featured: boolean;
  published_at: string | null;
};
type GalleryItem = { id: string; title: string; image_url: string; is_active?: boolean }

const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
const STATUS_PILL: Record<string, string> = { draft: 'bg-slate-700 text-slate-300', published: 'bg-emerald-500/15 text-emerald-300', archived: 'bg-amber-500/15 text-amber-300' };
const EDITOR_CSS = `.ProseMirror{min-height:320px;outline:none;padding:12px 16px;border:1px solid #475569;border-radius:16px;background:#0b1220;color:#e2e8f0}.ProseMirror h1{font-size:1.5rem;font-weight:700;color:#f1f5f9}.ProseMirror h2{font-size:1.3rem;font-weight:600}.ProseMirror h3{font-size:1.15rem;font-weight:600}.ProseMirror ul,.ProseMirror ol{padding-right:1.2rem}.ProseMirror blockquote{border-right:3px solid #7c3aed;padding:4px 12px;color:#cbd5e1}.ProseMirror code{background:#1e293b;padding:1px 6px;border-radius:6px;color:#f8fafc}.ProseMirror pre{background:#0f172a;padding:12px;border-radius:10px;color:#e2e8f0;direction:ltr;text-align:left}.ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);float:right;color:#64748b;height:0;pointer-events:none}`;

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [featured, setFeatured] = useState(false);
  const [html, setHtml] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [pickOpen, setPickOpen] = useState(false);

  const editor = useEditor({
    extensions: [Document, Paragraph, Text, ListItem, BulletList, OrderedList, Bold, Italic, Underline, Link, Image.configure({ inline: false }), Heading, CodeBlock, Blockquote, Placeholder.configure({ placeholder: 'ابدأ الكتابة هنا...' })],
    content: html,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/articles');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      setArticles((json.data ?? []) as Article[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadGallery = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gallery');
      const json = await res.json();
      if (res.ok) setGallery(((json.data ?? []) as GalleryItem[]).filter((g) => g.is_active !== false));
    } catch {
      /* noop */
    }
  }, []);

  const slugifyAr = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

  // ROOT-CAUSE FIX («المقالات لا تعرض المحتوى»): TipTap only reads `content`
  // at editor creation — reopening the modal kept a stale (empty) editor, so
  // every existing article opened blank and any later save wiped the stored
  // content. Sync the editor explicitly on every open.
  const openNew = () => {
    setEditingId(null); setTitle(''); setSlug(''); setExcerpt(''); setCategory(''); setTags(''); setStatus('draft'); setFeatured(false); setHtml(''); setOpen(true);
    if (editor) editor.commands.clearContent();
  };
  const openEdit = (a: Article) => {
    setEditingId(a.id); setTitle(a.title); setSlug(a.slug ?? ''); setExcerpt(a.excerpt ?? ''); setCategory(a.category ?? ''); setTags((a.tags ?? []).join('، ')); setStatus(a.status === 'archived' ? 'draft' : (a.status === 'published' ? 'published' : 'draft')); setFeatured(a.is_featured); setHtml(a.content); setOpen(true);
    if (editor) editor.commands.setContent(a.content || '');
  };

  const save = async (mode: 'draft' | 'published') => {
    setBusy(true); setError(null);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        excerpt: excerpt.trim() || null,
        category: category.trim() || null,
        tags: tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean),
        content: html,
        is_featured: featured,
        status: mode,
        published_at: mode === 'published' ? new Date().toISOString() : null,
      };
      const res = editingId
        ? await fetch('/api/admin/articles/' + editingId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setNotice('✓ حُفظ المقال');
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذا المقال؟')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/articles/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      setNotice('✓ حُذف المقال');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  };

  const tb = (label: string, run: (ed: NonNullable<typeof editor>) => void, active = false) => (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); if (editor) run(editor); }} className={`min-w-8 rounded-lg px-2 py-1 text-xs ${active ? 'bg-violet-500/25 text-violet-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{label}</button>
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => !filter || a.status === filter).filter((a) => !q || a.title.toLowerCase().includes(q) || (a.slug ?? '').includes(q) || (a.category ?? '').toLowerCase().includes(q));
  }, [articles, filter, query]);

  return (
    <>
    <style>{EDITOR_CSS}</style>
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">📝 المقالات</h2>
          <p className="mt-1 text-sm text-slate-400">محتوى صفحة /ask — اكتب المحتوى الطبي بسهولة.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 بحث..." className="w-52 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
            <option value="">كل الحالات</option>
            <option value="published">منشور</option>
            <option value="draft">مسودة</option>
            <option value="archived">مؤرشف</option>
          </select>
          <button type="button" onClick={openNew} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">➕ مقال جديد</button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">لا توجد مقالات — أنشئ أول مقال.</p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-800">
          {filtered.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-200">{a.title}</p>
                <p className="text-xs text-slate-500" dir="ltr">{a.slug} · {a.published_at?.slice(0, 10) ?? '—'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[a.status] ?? ''}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                {a.is_featured && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-200">⭐ مميز</span>}
                <button type="button" onClick={() => openEdit(a)} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">✏️ تعديل</button>
                <button type="button" onClick={() => void remove(a.id)} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25">🗑️ حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">{editingId ? '✏️ تعديل مقال' : '➕ مقال جديد'}</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-300">إغلاق ✕</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400">العنوان *</label>
                <input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(slugifyAr(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">Slug</label>
                <input value={slug} onChange={(e) => setSlug(slugifyAr(e.target.value))} dir="ltr" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400">المقتطف (excerpt)</label>
                <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">الفئة</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="مثال: صحة الفم" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">الوسوم (فاصلة)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">الحالة</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  <option value="draft">مسودة</option>
                  <option value="published">منشور</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pt-4 text-sm text-slate-300">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-violet-500" /> ⭐ مقال مميز
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-400">المحتوى *</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {tb('ب', (ed) => void ed.chain().focus().toggleBold().run(), editor?.isActive('bold') ?? false)}
                {tb('م', (ed) => void ed.chain().focus().toggleItalic().run(), editor?.isActive('italic') ?? false)}
                {tb('ت', (ed) => void ed.chain().focus().toggleUnderline().run())}
                {tb('H1', (ed) => void ed.chain().focus().toggleHeading({ level: 1 }).run())}
                {tb('H2', (ed) => void ed.chain().focus().toggleHeading({ level: 2 }).run())}
                {tb('H3', (ed) => void ed.chain().focus().toggleHeading({ level: 3 }).run())}
                {tb('• قائمة', (ed) => void ed.chain().focus().toggleBulletList().run())}
                {tb('1. قائمة', (ed) => void ed.chain().focus().toggleOrderedList().run())}
                {tb('❝ اقتباس', (ed) => void ed.chain().focus().toggleBlockquote().run())}
                {tb('</>', (ed) => void ed.chain().focus().toggleCodeBlock().run())}
                <button type="button" onMouseDown={(e) => { e.preventDefault(); const url = window.prompt('رابط مقصد:'); if (url && editor) void editor.chain().focus().toggleLink({ href: url }).run(); }} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">🔗 رابط</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setPickOpen(true); void loadGallery(); }} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">🖼️ صورة من المعرض</button>
                {tb('↩ تراجع', (ed) => void (ed.chain().focus() as unknown as { undo: () => { run: () => unknown } }).undo().run())}
                {tb('↪ إعادة', (ed) => void (ed.chain().focus() as unknown as { redo: () => { run: () => unknown } }).redo().run())}
              </div>
              <EditorContent editor={editor!} className="mt-2" />
              <p className="mt-1 text-xs text-slate-500" dir="ltr">{html.length} chars</p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => void save('published')} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500">🚀 نشر{busy ? '...' : ''}</button>
              <button type="button" disabled={busy} onClick={() => void save('draft')} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">💾 حفظ كمسودة</button>
            </div>
          </div>
        </div>
      )}

      {pickOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPickOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">🖼️ اختر صورة من المعرض</h3>
            {gallery.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">لم تُحمّل الصور بعد — حمّلها من صفحة المعرض أولاً.</p>
            ) : (
              <div className="mt-4 grid max-h-96 grid-cols-3 gap-3 overflow-y-auto">
                {gallery.map((g) => (
                  <button key={g.id} type="button" onClick={() => { if (editor) void editor.chain().focus().setImage({ src: g.image_url, alt: g.title }).run(); setPickOpen(false); }} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.image_url} alt={g.title} loading="lazy" className="h-20 w-full object-cover" />
                    <span className="block truncate px-1 pt-1 text-[10px] text-slate-400">{g.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
