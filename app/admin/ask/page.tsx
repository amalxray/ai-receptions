'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Save } from 'lucide-react';

type Settings = {
  hero: { title: string; subtitle: string; logo: string; assistant_name: string };
  colors: { primary: string; secondary: string; heading: string; warning: string };
  sections_order: string[];
  sections?: Record<string, boolean>;
  questions: string[];
  search_config: { limit: number; sort: string; radius_km: number; require_location: boolean };
};

const DEFAULT_SECTIONS_ORDER = [
  'hero',
  'quick_questions',
  'tips',
  'articles',
  'stories',
  'fun_facts',
  'faq',
  'cta',
  'gallery',
];

const SECTION_LABELS: Record<string, string> = {
  hero: 'الغلاف',
  quick_questions: 'الأسئلة السريعة',
  tips: 'النصائح',
  articles: 'المقالات',
  stories: 'قصص النجاح',
  fun_facts: 'حقائق ممتعة',
  faq: 'الأسئلة الشائعة',
  cta: 'زر الحجز (CTA)',
  gallery: 'معرض الصور',
};

const COLOR_FIELDS = [
  { key: 'primary', label: 'اللون الأساسي' },
  { key: 'secondary', label: 'الثانوي' },
  { key: 'heading', label: 'لون العناوين' },
  { key: 'warning', label: 'التحذيرات' },
];

type AskGalleryItem = {
  id: string;
  title: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  scope?: 'main_site' | 'ask_page';
};

// مكون العنصر القابل للسحب
function SortableSectionItem({ id, label }: { id: string; label: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 transition-colors hover:border-violet-500/50"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-violet-400 active:cursor-grabbing"
        aria-label="سحب لإعادة الترتيب"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="text-sm font-medium text-slate-200">{label}</span>
    </div>
  );
}

function AskMediaGallerySection() {
  const [items, setItems] = useState<AskGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gallery?scope=ask_page');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'فشل التحميل');
      setItems((json.data ?? []) as AskGalleryItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل معرض /ask');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson?.error ?? 'فشل رفع الملف');
      const title = (file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') || 'محتوى /ask').slice(0, 80);
      const res = await fetch('/api/admin/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          image_url: uploadJson.data.url,
          category: 'ask_page',
          tags: [],
          scope: 'ask_page',
          sort_order: items.length,
          is_active: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'فشل حفظ الملف');
      setNotice('✓ تم إضافة عنصر معرض /ask');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل رفع معرض /ask');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    try {
      const res = await fetch(`/api/admin/gallery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active, scope: 'ask_page' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'فشل تحديث الحالة');
      setNotice('✓ تم تحديث التفعيل');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحديث الحالة');
    }
  };

  const reorder = async (id: string, direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === id);
    if (currentIndex < 0) return;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setItems(next);
    for (let i = 0; i < next.length; i += 1) {
      const item = next[i];
      await fetch(`/api/admin/gallery/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i, scope: 'ask_page' }),
      });
    }
    setNotice('✓ تم تحديث ترتيب المعرض');
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذا العنصر من معرض /ask؟')) return;
    try {
      const res = await fetch(`/api/admin/gallery/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'فشل الحذف');
      setNotice('✓ تم حذف العنصر');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف');
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`هل تريد حذف ${selectedIds.length} عنصر نهائياً من معرض /ask؟`)) return;
    setBusy(true);
    try {
      const promises = selectedIds.map(id => 
        fetch(`/api/admin/gallery/${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      setNotice(`✓ تم حذف ${selectedIds.length} عنصر`);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف الجماعي');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(item => item.id));
    }
  };

  return (
    <div className="mt-4 space-y-3">
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files?.[0]; if (file) void upload(file); }}
        className={`block cursor-pointer rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition ${dragging ? 'border-violet-400 bg-violet-500/10 text-violet-200' : 'border-slate-700 bg-slate-950/40 text-slate-300 hover:border-violet-500/50'}`}
      >
        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
        {busy ? 'جارٍ الرفع...' : '➕ رفع صورة أو فيديو لمعرض /ask'}
      </label>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">جارٍ تحميل المعرض...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">لا توجد عناصر في معرض /ask حتى الآن.</div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            >
              {selectedIds.length === items.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds([...selectedIds, item.id]);
                      } else {
                        setSelectedIds(selectedIds.filter(id => id !== item.id));
                      }
                    }}
                    className="absolute left-2 top-2 z-10 h-5 w-5 cursor-pointer rounded accent-violet-500"
                  />
                  {item.image_url.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                    <video src={item.image_url} controls className="h-40 w-full object-cover bg-slate-900" />
                  ) : (
                    <img src={item.image_url} alt={item.title} className="h-40 w-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => void toggleActive(item.id, !item.is_active)} className={`rounded-full px-2 py-1 text-[11px] font-medium ${item.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-200'}`}>
                      {item.is_active ? 'مُفعل' : 'مُخفى'}
                    </button>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => window.open(item.image_url, '_blank', 'noopener,noreferrer')} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-200">معاينة</button>
                      <button type="button" onClick={() => void reorder(item.id, -1)} disabled={items.indexOf(item) === 0} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-40">↑</button>
                      <button type="button" onClick={() => void reorder(item.id, 1)} disabled={items.indexOf(item) === items.length - 1} className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-40">↓</button>
                      <button type="button" onClick={() => void remove(item.id)} className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">حذف</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminAskSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newQ, setNewQ] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ask-settings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      const d = (json.data ?? {}) as Partial<Settings>;
      const legacySectionsOrder = d.sections && typeof d.sections === 'object'
        ? Object.keys(d.sections)
        : [];
      setSettings({
        hero: (d.hero ?? { title: '', subtitle: '', logo: '🦷', assistant_name: 'سنّي' }) as Settings['hero'],
        colors: (d.colors ?? { primary: '', secondary: '', heading: '', warning: '' }) as Settings['colors'],
        sections_order: Array.isArray(d.sections_order) && d.sections_order.every((section) => typeof section === 'string')
          ? d.sections_order
          : [...legacySectionsOrder, ...DEFAULT_SECTIONS_ORDER.filter((section) => !legacySectionsOrder.includes(section))],
        questions: d.questions ?? [],
        search_config: d.search_config ?? { limit: 3, sort: 'distance', radius_km: 50, require_location: false },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveKey = async (key: string, value: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ask-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'فشل الحفظ');
      }
      setNotice(`✓ حُفظ «${key}»`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSettings((prev) => {
        if (!prev) return prev;
        const oldIndex = prev.sections_order.indexOf(active.id as string);
        const newIndex = prev.sections_order.indexOf(over.id as string);
        return {
          ...prev,
          sections_order: arrayMove(prev.sections_order, oldIndex, newIndex),
        };
      });
    }
  };

  if (loading) return <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 text-sm text-slate-400">جارٍ التحميل...</div>;
  if (error && !settings) return <div className="rounded-[2rem] border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">{error}</div>;
  if (!settings) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h2 className="text-lg font-semibold text-white">🎨 إعدادات صفحة /ask</h2>
        <p className="mt-1 text-sm text-slate-400">كل قسم يُحفظ منفرداً — التعديل يظهر مباشرة على الصفحة العامة.</p>
        {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
        {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}
      </div>

      {/* Hero */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h3 className="text-sm font-semibold text-white">🦷 الغلاف (Hero)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={settings.hero.title} onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, title: e.target.value } })} placeholder="العنوان" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          <input value={settings.hero.assistant_name} onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, assistant_name: e.target.value } })} placeholder="اسم المساعد" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          <input value={settings.hero.subtitle} onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, subtitle: e.target.value } })} placeholder="الوصف" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
          <input value={settings.hero.logo} onChange={(e) => setSettings({ ...settings, hero: { ...settings.hero, logo: e.target.value } })} placeholder="🦷 شعار (emoji)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </div>
        <button type="button" onClick={() => void saveKey('hero', settings.hero)} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">💾 حفظ الغلاف</button>
      </div>

      {/* Colors */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h3 className="text-sm font-semibold text-white">🎨 الألوان</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {COLOR_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs text-slate-400">{f.label}</span>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={settings.colors[f.key as keyof Settings['colors']] || '#000000'} onChange={(e) => setSettings({ ...settings, colors: { ...settings.colors, [f.key]: e.target.value } })} className="h-8 w-10 rounded border border-slate-700 bg-slate-950" />
                <input value={settings.colors[f.key as keyof Settings['colors']] ?? ''} onChange={(e) => setSettings({ ...settings, colors: { ...settings.colors, [f.key]: e.target.value } })} dir="ltr" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" />
              </div>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void saveKey('colors', settings.colors)} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">💾 حفظ الألوان</button>
      </div>

      {/* Sections Order (Drag & Drop) */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">🧩 ترتيب الأقسام</h3>
            <p className="mt-1 text-xs text-slate-400">اسحب الأقسام لإعادة ترتيبها في صفحة /ask العامة.</p>
          </div>
          <button
            type="button"
            onClick={() => void saveKey('sections_order', settings.sections_order)}
            className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            <Save className="h-3.5 w-3.5" />
            حفظ الترتيب
          </button>
        </div>

        <div className="mt-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={settings.sections_order} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {settings.sections_order.map((key) => (
                  <SortableSectionItem
                    key={key}
                    id={key}
                    label={SECTION_LABELS[key] ?? key}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* Questions */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h3 className="text-sm font-semibold text-white">💬 الأسئلة السريعة</h3>
        <ul className="mt-3 space-y-2">
          {settings.questions.map((q, i) => (
            <li key={i} className="flex items-center gap-2">
              <input value={q} onChange={(e) => setSettings({ ...settings, questions: settings.questions.map((x, xi) => xi === i ? e.target.value : x) })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100" />
              <button type="button" onClick={() => setSettings({ ...settings, questions: settings.questions.filter((_, xi) => xi !== i) })} className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-300">✕</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="سؤال جديد..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100" />
          <button type="button" onClick={() => { if (newQ.trim()) { setSettings({ ...settings, questions: [...settings.questions, newQ.trim()] }); setNewQ(''); } }} className="rounded-full bg-slate-700 px-3 py-1.5 text-xs text-slate-200">➕ إضافة</button>
        </div>
        <button type="button" onClick={() => void saveKey('questions', settings.questions)} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">💾 حفظ الأسئلة</button>
      </div>

      {/* Ask media gallery */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">🖼️ معرض منصة /ask</h3>
            <p className="mt-1 text-xs text-slate-400">صور/فيديوات خاصة بعرض العيادات داخل صفحة /ask. هذا القسم مفصول عن معرض الموقع الرئيسي.</p>
          </div>
          <a href="/ask" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/20">معاينة /ask</a>
        </div>
        <AskMediaGallerySection />
      </div>

      {/* Search config */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h3 className="text-sm font-semibold text-white">🔍 إعدادات البحث والاقتراح</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-xs text-slate-400">عدد الاقتراحات (1-10)</span>
            <input type="number" min={1} max={10} value={settings.search_config.limit} onChange={(e) => setSettings({ ...settings, search_config: { ...settings.search_config, limit: Number(e.target.value) || 3 } })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">الترتيب</span>
            <select value={settings.search_config.sort} onChange={(e) => setSettings({ ...settings, search_config: { ...settings.search_config, sort: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
              <option value="distance">المسافة</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">نطاق البحث (كم)</span>
            <input type="number" min={1} max={200} value={settings.search_config.radius_km} onChange={(e) => setSettings({ ...settings, search_config: { ...settings.search_config, radius_km: Number(e.target.value) || 50 } })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">إلزامي الموقع؟</span>
            <label className="mt-1 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={Boolean(settings.search_config.require_location)} onChange={(e) => setSettings({ ...settings, search_config: { ...settings.search_config, require_location: e.target.checked } })} className="accent-violet-500" />
              نعم
            </label>
          </label>
        </div>
        <button type="button" onClick={() => void saveKey('search_config', settings.search_config)} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">💾 حفظ البحث</button>
      </div>
    </div>
  );
}