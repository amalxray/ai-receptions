'use client';

import { useCallback, useEffect, useState } from 'react';

type Section = {
  section_key: string;
  label: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
};

/**
 * Landing Page CMS editor — section list + JSON editor per section.
 * Sections hold nested arrays (features cards, FAQ items…) with different
 * shapes — a generic JSON editor covers every section today and any new
 * section added tomorrow, with zero frontend changes. Values are validated
 * server-side (object-only) before upsert.
 */
export default function AdminLandingPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/landing-page');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      const list = (json.data ?? []) as Section[];
      setSections(list);
      setSelected((prev) => prev ?? list[0]?.section_key ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = sections.find((s) => s.section_key === selected) ?? null;

  const selectSection = (key: string) => {
    setSelected(key);
    setSuccess(null);
    setError(null);
    const sec = sections.find((s) => s.section_key === key);
    setDraft(sec?.content ? JSON.stringify(sec.content, null, 2) : '{\n  \n}');
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let content: unknown;
      try {
        content = JSON.parse(draft);
      } catch {
        throw new Error('JSON غير صالح — راجع الصيغة (الأقواس والفواصل)');
      }
      const res = await fetch(`/api/admin/landing-page/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setSuccess('تم الحفظ ✓ — الصفحة الرئيسية ستتحدث خلال ~30 ثانية.');
      await load();
      setSelected(selected);
      setDraft(JSON.stringify(content, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <h2 className="text-lg font-semibold text-white">🌐 محرر الصفحة الرئيسية</h2>
      <p className="mt-1 text-sm text-slate-400">
        تحكم كامل بمحتوى اللاندينغ — عدّل أي قسم واحفظ. القسم بدون تعديل محفوظ يستخدم النص الافتراضي.
      </p>

      {loading && <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>}

      {!loading && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <ul className="space-y-1 text-sm">
              {sections.map((s) => (
                <li key={s.section_key}>
                  <button
                    type="button"
                    onClick={() => selectSection(s.section_key)}
                    className={`w-full rounded-xl px-3 py-2 text-right transition ${
                      selected === s.section_key
                        ? 'bg-violet-500/20 text-white ring-1 ring-violet-500/40'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="block">{s.label}</span>
                    <span className="block text-[10px] text-slate-500" dir="ltr">
                      {s.section_key}
                      {s.updated_at ? ' · ✏️ مُعدّل' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div>
            {current ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-200">{current.label}</h3>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'جارٍ الحفظ...' : '💾 حفظ القسم'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500" dir="ltr">
                  section_key: {current.section_key}
                </p>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  dir="ltr"
                  spellCheck={false}
                  className="mt-3 h-96 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none focus:border-violet-500/70"
                  placeholder='{"title": "..."}'
                />
                {error && (
                  <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
                )}
                {success && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</div>
                )}
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  تلميح: القوائم (features.cards، faq.items…) مصفوفات JSON. حقل colors.cta يقبل لون HEX (مثل #7c3aed) يُطبَّق على أزرار CTA الرئيسية؛ اتركه فارغاً للون الافتراضي.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">اختر قسماً من القائمة.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
