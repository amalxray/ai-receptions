'use client';

import { useState, type ChangeEvent } from 'react';
import Hero, { type HeroContent } from '@/components/landing/Hero';
import { landingCopy } from '@/lib/landing/landing-copy';

const defaultHero = landingCopy.hero as HeroContent;

type HeroEditorProps = {
  initialContent: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (content: HeroContent) => void;
  onImageSaved: (image: string) => void;
};

function normalizeContent(content: Record<string, unknown> | null): HeroContent {
  const candidate = { ...defaultHero, ...(content ?? {}) } as HeroContent;
  return {
    ...candidate,
    stats: Array.isArray(candidate.stats)
      ? candidate.stats.map((stat) => ({ value: String(stat.value ?? ''), label: String(stat.label ?? '') }))
      : defaultHero.stats.map((stat) => ({ ...stat })),
  };
}

export default function HeroEditor({ initialContent, onClose, onSaved, onImageSaved }: HeroEditorProps) {
  const [draft, setDraft] = useState<HeroContent>(() => normalizeContent(initialContent));
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const update = (key: keyof Omit<HeroContent, 'stats'>, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateStat = (index: number, key: 'value' | 'label', value: string) => {
    setDraft((current) => ({
      ...current,
      stats: current.stats.map((stat, statIndex) => statIndex === index ? { ...stat, [key]: value } : stat),
    }));
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setUploadingImage(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/landing-page/hero/image', { method: 'POST', body: form });
      const body = await response.json().catch(() => null) as { error?: string; data?: { url?: string } } | null;
      if (!response.ok || !body?.data?.url) throw new Error(body?.error ?? 'تعذر رفع صورة الغلاف وحفظها');

      setDraft((current) => ({ ...current, image: body.data?.url ?? '' }));
      onImageSaved(body.data.url);
      setSuccess('تم رفع صورة الغلاف وحفظها في الموقع.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع صورة الغلاف وحفظها');
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/admin/landing-page/hero', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const body = await response.json().catch(() => null) as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
      if (!response.ok) {
        const detail = body?.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('، ');
        throw new Error(detail ? `${body?.error ?? 'تعذر الحفظ'}: ${detail}` : body?.error ?? 'تعذر حفظ محتوى Hero');
      }
      setSuccess('تم حفظ قسم Hero بنجاح.');
      onSaved(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ محتوى Hero');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';
  const textField = (key: keyof Omit<HeroContent, 'stats'>, label: string, options: { multiline?: boolean; url?: boolean } = {}) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {options.multiline ? (
        <textarea rows={3} maxLength={key === 'description' ? 800 : 500} value={draft[key]} onChange={(event) => update(key, event.target.value)} className={inputClass} />
      ) : (
        <input type={options.url ? 'url' : 'text'} maxLength={options.url ? 600 : 160} value={draft[key]} onChange={(event) => update(key, event.target.value)} className={inputClass} dir={options.url ? 'ltr' : undefined} />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="hero-editor-title" className="mx-auto my-4 max-w-5xl rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <h2 id="hero-editor-title" className="text-xl font-bold text-slate-900">تحرير الواجهة الرئيسية (Hero)</h2>
            <p className="mt-1 text-sm text-slate-500">عدّل النصوص والروابط والإحصاءات. المعاينة تعرض مكوّن Hero الفعلي قبل الحفظ.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق المحرر" className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">✕</button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
            <label className="block text-sm font-medium text-slate-700">
              صورة الغلاف
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadImage(event)} disabled={uploadingImage || saving} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-semibold file:text-violet-700`} />
              <span className="mt-1 block text-xs text-slate-500">JPEG أو PNG أو WebP أو GIF، بحد أقصى 10 ميغابايت. يُرفع ويحفظ مباشرة.</span>
            </label>
            {draft.image && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <span className="truncate text-xs text-slate-500" dir="ltr">{draft.image}</span>
                <button type="button" onClick={() => update('image', '')} className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600">إزالة الصورة</button>
              </div>
            )}
            {textField('headline1', 'العنوان الرئيسي')}
            {textField('headline2', 'العنوان الفرعي')}
            {textField('paragraph', 'النص التمهيدي', { multiline: true })}
            {textField('description', 'الوصف', { multiline: true })}

            <div className="grid gap-4 sm:grid-cols-2">
              {textField('ctaPrimary', 'نص الزر الأول')}
              {textField('ctaPrimaryHref', 'رابط الزر الأول', { url: true })}
              {textField('ctaSecondary', 'نص الزر الثاني')}
              {textField('ctaSecondaryHref', 'رابط الزر الثاني', { url: true })}
            </div>

            <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold text-slate-800">الإحصاءات</legend>
              {draft.stats.map((stat, index) => (
                <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                  <label className="text-sm text-slate-700">القيمة
                    <input value={stat.value} maxLength={30} onChange={(event) => updateStat(index, 'value', event.target.value)} className={inputClass} />
                  </label>
                  <label className="text-sm text-slate-700">العنوان
                    <input value={stat.label} maxLength={80} onChange={(event) => updateStat(index, 'label', event.target.value)} className={inputClass} />
                  </label>
                  <button type="button" disabled={draft.stats.length <= 1} onClick={() => setDraft((current) => ({ ...current, stats: current.stats.filter((_, i) => i !== index) }))} className="mb-0.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-40">حذف</button>
                </div>
              ))}
              <button type="button" disabled={draft.stats.length >= 6} onClick={() => setDraft((current) => ({ ...current, stats: [...current.stats, { value: '', label: '' }] }))} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40">＋ إضافة إحصائية</button>
            </fieldset>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setPreview((value) => !value)} className="rounded-full border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{preview ? 'إخفاء المعاينة' : 'معاينة التغييرات'}</button>
              <button type="button" onClick={() => void save()} disabled={saving || uploadingImage} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ Hero'}</button>
            </div>
          </div>

          <aside className="min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">المعاينة الحية للمكوّن الفعلي</h3>
            <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${preview ? '' : 'max-h-72'}`}>
              <Hero content={draft} />
            </div>
            {!preview && <p className="mt-2 text-xs text-slate-500">المعاينة مصغرة؛ اضغط «معاينة التغييرات» لعرض القسم كاملًا.</p>}
          </aside>
        </div>
      </section>
    </div>
  );
}
