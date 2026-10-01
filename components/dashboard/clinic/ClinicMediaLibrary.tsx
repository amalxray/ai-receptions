'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useClinicContext } from '@/lib/useClinicContext';
import Skeleton from '@/components/ui/Skeleton';

type MediaItem = { id: string; public_url: string; title: string | null; category: string; enabled: boolean; media_type: 'image' | 'video' };
type Props = { mode?: 'manage' | 'select'; onSelect?: (item: MediaItem) => void; onClose?: () => void };

async function optimizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const candidates: Array<{ mime: string; ext: string; quality: number }> = [
      { mime: 'image/avif', ext: 'avif', quality: 0.76 },
      { mime: 'image/webp', ext: 'webp', quality: 0.82 },
    ];

    for (const candidate of candidates) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, candidate.mime, candidate.quality)
      );
      if (blob && blob.type === candidate.mime) {
        return new File(
          [blob],
          `${file.name.replace(/\.[^.]+$/, '')}.${candidate.ext}`,
          { type: candidate.mime }
        );
      }
    }

    return file;
  } catch {
    return file;
  }
}

export default function ClinicMediaLibrary({ mode = 'manage', onSelect, onClose }: Props) {
  const { clinicId, authHeaders } = useClinicContext();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const endpoint = `/api/clinic/public-media?clinic_id=${encodeURIComponent(clinicId ?? '')}`;

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { headers: await authHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'تعذر تحميل مكتبة الصور');
      setItems(body.data ?? []); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المكتبة'); }
    finally { setLoading(false); }
  }, [clinicId, endpoint, authHeaders]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => item.media_type === 'image' && (!query || `${item.title ?? ''} ${item.category}`.toLowerCase().includes(query.toLowerCase()))), [items, query]);

  const upload = async (file?: File) => {
    if (!file || !clinicId) return;
    if (!file.type.startsWith('image/')) { setError('اختر ملف صورة صالحاً.'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('الحد الأقصى للصورة 25MB.'); return; }
    setBusy(true); setError('');
    try {
      const optimized = await optimizeImage(file);
      const form = new FormData(); form.append('file', optimized); form.append('title', file.name.replace(/\.[^.]+$/, '')); form.append('category', 'other');
      const response = await fetch(endpoint, { method: 'POST', headers: await authHeaders(), body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'تعذر رفع الصورة');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر رفع الصورة'); }
    finally { setBusy(false); }
  };

  const remove = async (item: MediaItem) => {
    if (!window.confirm('حذف الصورة نهائياً من مكتبة الوسائط؟ قد يؤثر ذلك على الإعلانات أو الصفحة العامة التي تستخدمها.')) return;
    try {
      const response = await fetch(`/api/clinic/public-media/${item.id}?clinic_id=${encodeURIComponent(clinicId ?? '')}`, { method: 'DELETE', headers: await authHeaders() });
      if (!response.ok) throw new Error('تعذر حذف الصورة');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حذف الصورة'); }
  };

  const content = <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الصورة أو تصنيفها" className="min-w-48 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />{mode === 'manage' && <label className="cursor-pointer rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">{busy ? 'جارٍ الرفع…' : '⬆ رفع صورة جديدة'}<input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>}</div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0,1,2,3,4,5].map((n) => <Skeleton key={n} className="aspect-square" />)}</div> : filtered.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{filtered.map((item) => <motion.article key={item.id} whileHover={{ y: -3 }} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl">{mode === 'select' ? <button type="button" onClick={() => onSelect?.(item)} className="block w-full text-left"> <img src={item.public_url} alt={item.title ?? ''} className="aspect-square w-full object-cover" /><span className="block truncate p-2 text-sm text-slate-700">{item.title || 'صورة بدون عنوان'}</span></button> : <><img src={item.public_url} alt={item.title ?? ''} loading="lazy" className="aspect-square w-full object-cover" /><div className="flex items-center justify-between gap-2 p-2"><span className="truncate text-sm text-slate-700">{item.title || 'صورة بدون عنوان'}</span><button type="button" onClick={() => void remove(item)} className="rounded-full p-2 text-rose-700 hover:bg-rose-50" aria-label="حذف الصورة">🗑</button></div></>}</motion.article>)}</div> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">لا توجد صور في المكتبة بعد.</p>}
  </div>;

  return mode === 'select' ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex justify-between"><h3 className="font-bold text-slate-900">اختر صورة من المكتبة</h3><button type="button" onClick={onClose} className="text-slate-500">✕</button></div>{content}</motion.div></div> : content;
}
