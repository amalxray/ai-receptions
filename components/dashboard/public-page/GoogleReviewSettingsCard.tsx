'use client';

import React, { useEffect, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';
import { DEFAULT_GOOGLE_REVIEW_LABEL, supportsGoogleReviewSettings } from '@/lib/services/googleReviewSettings';

export default function GoogleReviewSettingsCard() {
  const { clinicId, authHeaders, activityType } = useClinicContext();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState(DEFAULT_GOOGLE_REVIEW_LABEL);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!clinicId || !supportsGoogleReviewSettings(activityType)) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const response = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? 'تعذر تحميل إعدادات زر Google');
        if (cancelled) return;
        setUrl(body.data?.google_review_url ?? '');
        setLabel(body.data?.google_review_label ?? DEFAULT_GOOGLE_REVIEW_LABEL);
        setEnabled(body.data?.google_review_enabled ?? false);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل إعدادات زر Google');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [activityType, authHeaders, clinicId]);

  if (!supportsGoogleReviewSettings(activityType)) return null;

  async function save() {
    if (!clinicId || saving) return;
    if (enabled && !url.trim()) {
      setError('أضف رابط تقييم Google قبل تفعيل الزر.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/clinic/public-page?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          google_review_url: url.trim() || null,
          google_review_enabled: enabled,
          google_review_label: label.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? 'تعذر حفظ إعدادات زر Google');
      setUrl(body.data?.google_review_url ?? '');
      setLabel(body.data?.google_review_label ?? DEFAULT_GOOGLE_REVIEW_LABEL);
      setEnabled(body.data?.google_review_enabled ?? false);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ إعدادات زر Google');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 p-4" aria-labelledby="google-review-settings-title">
      <h3 id="google-review-settings-title" className="text-sm font-bold text-slate-100">
        زر تقييم Google
      </h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        أدر الزر الذي يفتح رابط التقييم الخاص بهذا المركز في صفحة المركز العامة.
      </p>
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
      {loading ? (
        <p className="mt-3 text-xs text-slate-500" role="status">جارٍ تحميل إعدادات Google…</p>
      ) : (
        <>
          <label className="mt-4 flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            إظهار زر «قيّمنا على Google»
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">رابط تقييم Google</span>
              <input
                type="url"
                maxLength={600}
                dir="ltr"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                placeholder="https://g.page/r/.../review"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="block text-xs text-slate-400">
              <span className="mb-1 block">نص الزر</span>
              <input
                type="text"
                maxLength={80}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="min-h-10 rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ…' : saved ? 'تم الحفظ ✓' : 'حفظ إعدادات Google'}
            </button>
            {url && <code dir="ltr" className="max-w-full break-all text-xs text-slate-500">{url}</code>}
          </div>
        </>
      )}
    </section>
  );
}
