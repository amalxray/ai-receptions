'use client';

import { useState } from 'react';

export type GallerySettingsContent = {
  size: 'small' | 'medium' | 'large';
  speed: 'slow' | 'normal' | 'fast';
  fit: 'contain' | 'cover';
};

type GallerySettingsEditorProps = {
  initialContent: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (content: GallerySettingsContent) => void;
};

const DEFAULTS: GallerySettingsContent = { size: 'medium', speed: 'normal', fit: 'contain' };

const SIZE_OPTIONS: Array<{ value: GallerySettingsContent['size']; label: string }> = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'متوسط' },
  { value: 'large', label: 'كبير' },
];

const SPEED_OPTIONS: Array<{ value: GallerySettingsContent['speed']; label: string }> = [
  { value: 'slow', label: 'بطيء' },
  { value: 'normal', label: 'عادي' },
  { value: 'fast', label: 'سريع' },
];

const FIT_OPTIONS: Array<{ value: GallerySettingsContent['fit']; label: string }> = [
  { value: 'contain', label: 'كامل' },
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
  const size = content?.size === 'small' || content?.size === 'large' ? content.size : 'medium';
  const speed = content?.speed === 'slow' || content?.speed === 'fast' ? content.speed : 'normal';
  const fit = content?.fit === 'cover' ? 'cover' : 'contain';
  return { size, speed, fit };
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
          <Segmented label="حجم المعرض" value={draft.size} options={SIZE_OPTIONS} onChange={(size) => setDraft((current) => ({ ...current, size }))} />
          <Segmented label="سرعة التنقل" value={draft.speed} options={SPEED_OPTIONS} onChange={(speed) => setDraft((current) => ({ ...current, speed }))} />
          <Segmented label="نمط العرض" value={draft.fit} options={FIT_OPTIONS} onChange={(fit) => setDraft((current) => ({ ...current, fit }))} />
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
