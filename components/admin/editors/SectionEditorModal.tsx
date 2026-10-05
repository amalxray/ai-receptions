'use client';

import { useState, type ReactNode } from 'react';

type SectionEditorModalProps = {
  title: string;
  description: string;
  preview: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onSave: () => Promise<void>;
};

export default function SectionEditorModal({ title, description, preview, children, onClose, onSave }: SectionEditorModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await onSave();
      setSuccess('تم حفظ التغييرات بنجاح.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="mx-auto my-4 max-w-6xl rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق المحرر" className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">✕</button>
        </header>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
            {children}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => void save()} disabled={saving} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</button>
              <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">إغلاق</button>
            </div>
          </div>
          <aside className="min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">معاينة مباشرة باستخدام مكوّن العرض العام</h3>
            <div className="max-h-[75vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50">{preview}</div>
          </aside>
        </div>
      </section>
    </div>
  );
}
