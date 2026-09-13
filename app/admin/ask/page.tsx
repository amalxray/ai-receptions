'use client';

import { useCallback, useEffect, useState } from 'react';

type Settings = {
  hero: { title: string; subtitle: string; logo: string; assistant_name: string };
  colors: { primary: string; secondary: string; heading: string; warning: string };
  sections: Record<string, boolean>;
  questions: string[];
  search_config: { limit: number; sort: string; radius_km: number; require_location: boolean };
};

const SECTION_LABELS: Record<string, string> = {
  hero: 'الغلاف',
  quick_questions: 'الأسئلة السريعة',
  tips: 'النصائح',
  articles: 'المقالات',
  stories: 'قصص النجاح',
  fun_facts: 'حقائق ممتعة',
  faq: 'الأسئلة الشائعة',
  cta: 'زر الحجز (CTA)',
};

const COLOR_FIELDS = [
  { key: 'primary', label: 'اللون الأساسي' },
  { key: 'secondary', label: 'الثانوي' },
  { key: 'heading', label: 'لون العناوين' },
  { key: 'warning', label: 'التحذيرات' },
];

export default function AdminAskSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newQ, setNewQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ask-settings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل');
      const d = (json.data ?? {}) as Partial<Settings>;
      setSettings({
        hero: (d.hero ?? { title: '', subtitle: '', logo: '🦷', assistant_name: 'سنّي' }) as Settings['hero'],
        colors: (d.colors ?? { primary: '', secondary: '', heading: '', warning: '' }) as Settings['colors'],
        sections: d.sections ?? {},
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
      if (!res.ok) throw new Error('فشل الحفظ');
      setNotice(`✓ حُفظ «${key}»`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
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

      {/* Sections */}
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
        <h3 className="text-sm font-semibold text-white">🧩 الأقسام (إظهار/إخفاء)</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={Boolean(settings.sections[key])} onChange={(e) => setSettings({ ...settings, sections: { ...settings.sections, [key]: e.target.checked } })} className="accent-violet-500" />
              {label}
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void saveKey('sections', settings.sections)} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">💾 حفظ الأقسام</button>
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
