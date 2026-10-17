'use client';

import { useState } from 'react';

export type SiteIdentityContent = {
  faviconUrl: string;
};

type SiteIdentityEditorProps = {
  initialContent: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (content: SiteIdentityContent) => void;
};

const DEFAULTS: SiteIdentityContent = {
  faviconUrl: '',
};

function normalize(content: Record<string, unknown> | null): SiteIdentityContent {
  const faviconUrl =
    typeof content?.faviconUrl === 'string' && content.faviconUrl.trim().length > 0
      ? content.faviconUrl.trim()
      : '';
  return { faviconUrl };
}

export default function SiteIdentityEditor({
  initialContent,
  onClose,
  onSaved,
}: SiteIdentityEditorProps) {
  const [draft, setDraft] = useState<SiteIdentityContent>(() => ({
    ...DEFAULTS,
    ...normalize(initialContent),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/landing-page/site_identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? 'تعذر حفظ هوية المنصة');
      onSaved(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ هوية المنصة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">🖼️ هوية المنصة</h3>
        <p className="mt-1 text-sm text-slate-600">
          استبدل أيقونة المتصفح (Favicon) وأيقونة iOS الخاصة بالمنصة.
        </p>
        <div className="mt-5 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              رابط أيقونة المتصفح (Favicon URL)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="url"
                placeholder="/icons/icon-32.png"
                value={draft.faviconUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, faviconUrl: event.target.value.trim() }))
                }
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setDraft((current) => ({ ...current, faviconUrl: '' }))}
                disabled={draft.faviconUrl.length === 0}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:text-red-600 disabled:opacity-50 disabled:pointer-events-none"
              >
                مسح
              </button>
            </div>
            {draft.faviconUrl && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={draft.faviconUrl.startsWith('/') ? draft.faviconUrl : `/${draft.faviconUrl}`}
                  alt="معاينة الأيقونة"
                  className="w-16 h-16 rounded-lg border border-slate-200 bg-white"
                />
                <span className="text-sm text-slate-500 truncate max-w-[200px]">{draft.faviconUrl}</span>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ الهوية'}
          </button>
        </div>
      </section>
    </div>
  );
}
