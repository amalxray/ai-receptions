'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BeforeAfterSlider from '@/components/public/BeforeAfterSlider';

type ProviderOption = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  provider_type?: string;
};

type Story = {
  id: string;
  patient_name: string;
  patient_age?: number | null;
  patient_city?: string | null;
  content: string;
  image_url?: string | null;
  before_image_url?: string | null;
  after_image_url?: string | null;
  outcome?: string | null;
  provider_id?: string | null;
  doctor_name?: string | null;
  specialty?: string | null;
  rating?: number | null;
  is_active?: boolean;
  sort_order?: number | null;
};

const emptyForm = {
  patient_name: '',
  patient_age: '',
  patient_city: '',
  content: '',
  image_url: '',
  before_image_url: '',
  after_image_url: '',
  outcome: '',
  provider_id: '',
  doctor_name: '',
  specialty: '',
  rating: '5',
  is_active: true,
  sort_order: '0',
};

export default function AdminStoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل تحميل القصص');
      setStories((json.data ?? []) as Story[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل القصص');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stories/providers');
      const json = await res.json();
      if (res.ok) setProviders((json.data ?? []) as ProviderOption[]);
    } catch {
      // no-op: manual entry remains valid if the provider list is unavailable
    }
  }, []);

  useEffect(() => {
    void loadStories();
    void loadProviders();
  }, [loadStories, loadProviders]);

  const previewTitle = useMemo(() => form.patient_name || 'قصة نجاح', [form.patient_name]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (story: Story) => {
    setEditingId(story.id);
    setForm({
      patient_name: story.patient_name ?? '',
      patient_age: story.patient_age?.toString() ?? '',
      patient_city: story.patient_city ?? '',
      content: story.content ?? '',
      image_url: story.image_url ?? '',
      before_image_url: story.before_image_url ?? '',
      after_image_url: story.after_image_url ?? '',
      outcome: story.outcome ?? '',
      provider_id: story.provider_id ?? '',
      doctor_name: story.doctor_name ?? '',
      specialty: story.specialty ?? '',
      rating: String(story.rating ?? 5),
      is_active: Boolean(story.is_active ?? true),
      sort_order: String(story.sort_order ?? 0),
    });
    setOpen(true);
  };

  const validate = () => {
    if (!form.patient_name.trim()) return 'اسم المريض مطلوب';
    if (!form.before_image_url.trim() || !form.after_image_url.trim()) return 'يجب إدخال صورتي قبل وبعد';
    if (!form.outcome.trim()) return 'يجب كتابة النتيجة النهائية';
    if (!form.doctor_name.trim() || !form.specialty.trim()) return 'يجب اختيار الطبيب والتخصص';
    if (!form.content.trim()) return 'وصف الحالة مطلوب';
    return null;
  };

  const save = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        patient_name: form.patient_name.trim(),
        patient_age: form.patient_age === '' ? null : Number(form.patient_age),
        patient_city: form.patient_city.trim() || null,
        content: form.content.trim(),
        image_url: form.image_url.trim() || null,
        before_image_url: form.before_image_url.trim(),
        after_image_url: form.after_image_url.trim(),
        outcome: form.outcome.trim(),
        provider_id: form.provider_id || null,
        doctor_name: form.doctor_name.trim(),
        specialty: form.specialty.trim(),
        rating: form.rating === '' ? 5 : Number(form.rating),
        is_active: Boolean(form.is_active),
        sort_order: form.sort_order === '' ? 0 : Number(form.sort_order),
      };

      const res = editingId
        ? await fetch('/api/admin/stories/' + editingId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'فشل الحفظ');
      setNotice('✓ تم حفظ قصة النجاح');
      setOpen(false);
      await loadStories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذه القصة؟')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/stories/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل الحذف');
      setNotice('✓ تم حذف القصة');
      await loadStories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">💚 قصص النجاح</h2>
          <p className="mt-1 text-sm text-slate-400">قارن الصور قبل/بعد مباشرةً ومعاينة الحقل النهائي</p>
        </div>
        <button type="button" onClick={openNew} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500">➕ قصة جديدة</button>
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}
      {notice && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">جارٍ التحميل...</p>
      ) : stories.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">لا توجد قصص بعد — أضف أول قصة نجاح.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {stories.map((story) => (
            <li key={story.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-200">{story.patient_name}</p>
                <p className="text-xs text-slate-500">{story.doctor_name ?? '—'} · {story.specialty ?? '—'}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(story)} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">✏️ تعديل</button>
                <button type="button" onClick={() => void remove(story.id)} className="rounded-full bg-rose-500/15 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/25">🗑️ حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto grid w-full max-w-6xl gap-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{editingId ? '✏️ تعديل قصة النجاح' : '➕ قصة جديدة'}</h3>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 px-3 py-1.5 text-sm text-slate-300">إغلاق ✕</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400">اسم المريض *</label>
                  <input value={form.patient_name} onChange={(e) => setForm((current) => ({ ...current, patient_name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">العمر</label>
                  <input type="number" value={form.patient_age} onChange={(e) => setForm((current) => ({ ...current, patient_age: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">المدينة</label>
                  <input value={form.patient_city} onChange={(e) => setForm((current) => ({ ...current, patient_city: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">التقييم</label>
                  <input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm((current) => ({ ...current, rating: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400">اختيار الطبيب</label>
                  <select
                    value={form.provider_id}
                    onChange={(e) => {
                      const provider = providers.find((item) => item.id === e.target.value);
                      setForm((current) => ({
                        ...current,
                        provider_id: e.target.value,
                        doctor_name: provider ? provider.name : current.doctor_name,
                        specialty: provider ? provider.specialty : current.specialty,
                      }));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">اختر طبيباً (اختياري)</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name} · {provider.specialty || provider.provider_type || 'طبيب'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400">اسم الطبيب *</label>
                  <input value={form.doctor_name} onChange={(e) => setForm((current) => ({ ...current, doctor_name: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">التخصص *</label>
                  <input value={form.specialty} onChange={(e) => setForm((current) => ({ ...current, specialty: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400">وصف الحالة *</label>
                  <textarea value={form.content} onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400">النتيجة *</label>
                  <textarea value={form.outcome} onChange={(e) => setForm((current) => ({ ...current, outcome: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400">رابط صورة الحالة (اختياري)</label>
                  <input value={form.image_url} onChange={(e) => setForm((current) => ({ ...current, image_url: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" dir="ltr" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">صورة قبل *</label>
                  <input value={form.before_image_url} onChange={(e) => setForm((current) => ({ ...current, before_image_url: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" dir="ltr" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs text-slate-400">صورة بعد *</label>
                  <input value={form.after_image_url} onChange={(e) => setForm((current) => ({ ...current, after_image_url: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" dir="ltr" placeholder="https://..." />
                </div>
                <label className="flex items-center gap-2 pt-4 text-sm text-slate-300">
                  <input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))} className="accent-violet-500" />
                  فعّالة في الصفحة العامة
                </label>
                <div>
                  <label className="block text-xs text-slate-400">الترتيب</label>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm((current) => ({ ...current, sort_order: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <h4 className="text-sm font-semibold text-white">المعاينة الحية</h4>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-700 bg-slate-900 p-2">
                  {form.before_image_url && form.after_image_url ? (
                    <BeforeAfterSlider before={form.before_image_url} after={form.after_image_url} title={previewTitle} />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">سيظهر المقارنة هنا</div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
                  <p className="font-bold text-slate-100">{previewTitle}</p>
                  <p className="mt-2 leading-6">{form.content || 'وصف الحالة سيظهر هنا...'}</p>
                  {form.outcome && <p className="mt-3 font-semibold text-emerald-300">النتيجة: {form.outcome}</p>}
                  <p className="mt-3 text-xs text-slate-400">{form.doctor_name || 'الطبيب'} · {form.specialty || 'التخصص'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">
              {busy ? 'جارٍ الحفظ...' : '💾 حفظ'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
