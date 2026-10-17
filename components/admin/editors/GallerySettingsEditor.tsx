'use client';

import { useState } from 'react';

export type GallerySettingsContent = {
  gallerySizePx: number;
  size: 'small' | 'medium' | 'large';
  gallerySpeed: 'slow' | 'normal' | 'fast';
  galleryFit: 'contain' | 'cover';
};

type GallerySettingsEditorProps = {
  initialContent: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (content: GallerySettingsContent) => void;
};

const DEFAULTS: GallerySettingsContent = {
  gallerySizePx: 400,
  size: 'large',
  gallerySpeed: 'normal',
  galleryFit: 'contain',
};

const SIZE_OPTIONS: Array<{ value: GallerySettingsContent['size']; label: string }> = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'متوسط' },
  { value: 'large', label: 'كبير' },
];

const SPEED_OPTIONS: Array<{ value: GallerySettingsContent['gallerySpeed']; label: string }> = [
  { value: 'slow', label: 'بطيء' },
  { value: 'normal', label: 'عادي' },
  { value: 'fast', label: 'سريع' },
];

const FIT_OPTIONS: Array<{ value: GallerySettingsContent['galleryFit']; label: string }> = [
  { value: 'contain', label: 'كامل (لا يقص)' },
  { value: 'cover', label: 'مقصوص' },
];

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-800">{label}</legend>
      <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function normalize(content: Record<string, unknown> | null): GallerySettingsContent {
  const gallerySizePx = typeof content?.gallerySizePx === 'number' && Number.isFinite(content.gallerySizePx) && content.gallerySizePx >= 200 && content.gallerySizePx <= 1200 ? Math.round(content.gallerySizePx) : 400;
  const gallerySpeed = content?.gallerySpeed === 'slow' || content?.gallerySpeed === 'fast' ? content.gallerySpeed : 'normal';
  const galleryFit = content?.galleryFit === 'cover' ? 'cover' : 'contain';
  const size = content?.size === 'small' || content?.size === 'large' ? content.size : 'large';
  return { gallerySizePx, gallerySpeed, galleryFit, size };
}

export default function GallerySettingsEditor({ initialContent, onClose, onSaved }: GallerySettingsEditorProps) {
  const [draft, setDraft] = useState<GallerySettingsContent>(() => ({ ...DEFAULTS, ...normalize(initialContent) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/landing-page/gallery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? 'تعذر حفظ إعدادات المعرض');
      onSaved(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ إعدادات المعرض');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">🖼️ إعدادات معرض الصور</h3>
        <p className="mt-1 text-sm text-slate-600">تتحكم في حجم البطاقات وسرعة التنقل ونمط عرض الصور.</p>
        <div className="mt-5 space-y-5">
        <div className="mt-5 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">حجم الصورة (بكسل)</label>
            <div className="flex items-end gap-3">
              <input
                type="number"
                min="200"
                max="1200"
                step="50"
                value={draft.gallerySizePx}
                onChange={(event) => {
                  const v = Math.min(1200, Math.max(200, Number(event.target.value) || 400));
                  setDraft((current) => ({ ...current, gallerySizePx: v }));
                }}
                className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-violet-500"
              />
              <span className="text-slate-500">px</span>
            </div>
            <div
              className="mt-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400"
              style={{ width: draft.gallerySizePx, height: draft.gallerySizePx }}
            >
              معاينة
            </div>
          </div>
          <Segmented label="حجم المعرض" value={draft.size} options={SIZE_OPTIONS} onChange={(size) => setDraft((current) => ({ ...current, size }))} />
          <Segmented label="سرعة التنقل" value={draft.gallerySpeed} options={SPEED_OPTIONS} onChange={(speed) => setDraft((current) => ({ ...current, gallerySpeed: speed }))} />
          <Segmented label="نمط العرض" value={draft.galleryFit} options={FIT_OPTIONS} onChange={(fit) => setDraft((current) => ({ ...current, galleryFit: fit }))} />
          <a href="/admin/gallery" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-600">إدارة الصور والفيديو ←</a>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
          <a href="/admin/gallery" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-600">إدارة الصور والفيديو ←</a>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">إلغاء</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button>
        </div>
      </section>
    </div>
  );
}
