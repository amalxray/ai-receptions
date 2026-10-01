'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { useToast } from '@/components/ui/Toast';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import DashboardSection from '@/components/dashboard/DashboardSection';
import Button from '@/components/ui/Button';
import ClinicMediaLibrary from '@/components/dashboard/clinic/ClinicMediaLibrary';

type Ad = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  cta_text: string;
  cta_link: string | null;
  is_active: boolean;
  display_order: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export default function AdsManager() {
  const { isConfigured: isSupabaseConfigured, checkFailed } = useSupabaseConfig();
  const {
    clinicId,
    clinicSlug,
    authHeaders,
    loading: clinicLoading,
    error: clinicError,
  } = useClinicContext();
  const { addToast } = useToast();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<Ad>>({});

  const endpoint = '/api/clinic/ads';

  async function load() {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'تعذر تحميل الإعلانات');
      setAds(body.data?.ads || body.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured && !checkFailed) { setLoading(false); return; }
    if (!clinicId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured, clinicId]);

  const openForm = (ad?: Ad) => {
    setEditingId(ad?.id ?? null);
    setForm(ad ?? {});
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !form.title) return;
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const body: Record<string, unknown> = { ...form };

      let res: Response;
      if (editingId) {
        res = await fetch(`${endpoint}/${editingId}?clinic_id=${encodeURIComponent(clinicId)}`, {
          method: 'PUT', headers, body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${endpoint}?clinic_id=${encodeURIComponent(clinicId)}`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر حفظ الإعلان');

      addToast({ type: 'success', message: editingId ? 'تم تحديث الإعلان' : 'تم إنشاء الإعلان' });
      closeForm();
      void load();
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'حدث خطأ' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAd = async (id: string) => {
    if (!clinicId) return;
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE', headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر حذف الإعلان');
      addToast({ type: 'success', message: 'تم حذف الإعلان' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'حدث خطأ' });
    }
  };

  const toggleActive = async (ad: Ad) => {
    if (!clinicId) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}/${ad.id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_active: !ad.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تحديث الإعلان');
      addToast({ type: 'success', message: ad.is_active ? 'تم إلغاء التفعيل' : 'تم التفعيل' });
      void load();
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'حدث خطأ' });
    }
  };

  if (clinicError || !clinicId) {
    return (
      <DashboardSection title="إعلانات العيادة" subtitle="إدارة العروض والعروض الترويجية لعيادتك.">
        <div className="py-8 text-center text-slate-400">
          {clinicError || 'جارٍ تحميل العيادة...'}
        </div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="إعلانات العيادة"
      subtitle="أدرّش العروض والعروض الترويجية التي يراها المرضون على الصفحة الرئيسية."
      action={
        <Button variant="cta" size="sm" onClick={() => openForm()}>
          + إعلان جديد
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : ads.length === 0 ? (
        <div className="py-8 text-center">
          <EmptyState
            title="لا توجد إعلانات بعد"
            description="أنشئ أول إعلان ترويجي لعيادتك لتظهر على الصفحة الرئيسية."
          />
          <Button variant="cta" size="md" className="mt-4" onClick={() => openForm()}>
            إنشاء إعلان
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <div key={ad.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{ad.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ad.is_active
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-600/30 text-slate-400'
                    }`}>
                      {ad.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  {ad.description && <p className="mt-1 text-sm text-slate-300">{ad.description}</p>}
                  {ad.cta_text && (
                    <span className="mt-1 inline-block text-xs text-cyan-300">نص الزر: {ad.cta_text}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(ad)}>
                    {ad.is_active ? 'إلغاء التفعيل' : 'تفعيل'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openForm(ad)}>
                    تعديل
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteAd(ad.id)}>
                    حذف
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <AdFormModal
          clinicId={clinicId}
          clinicSlug={clinicSlug}
          authHeaders={authHeaders}
          ad={editingId ? ads.find((a) => a.id === editingId) : undefined}
          form={form}
          setForm={setForm}
          submitting={submitting}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </DashboardSection>
  );
}

function AdFormModal({
  clinicId,
  clinicSlug,
  authHeaders,
  ad,
  form,
  setForm,
  submitting,
  onClose,
  onSubmit,
}: {
  clinicId: string;
  clinicSlug: string | null;
  authHeaders: () => Promise<Record<string, string>>;
  ad?: Ad;
  form: Partial<Ad>;
  setForm: (f: Partial<Ad>) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [ctaMode, setCtaMode] = useState<'url' | 'whatsapp' | 'phone' | 'booking' | 'none'>(() => {
    const link = form.cta_link ?? '';
    return !link ? 'none' : link.startsWith('https://wa.me/') ? 'whatsapp' : link.startsWith('tel:') ? 'phone' : link.includes('/book?slug=') ? 'booking' : 'url';
  });
  const [phoneTarget, setPhoneTarget] = useState(() => (form.cta_link ?? '').replace(/^(https:\/\/wa\.me\/|tel:)/, ''));
  const bookingUrl = clinicSlug ? `/book?slug=${encodeURIComponent(clinicSlug)}` : '/book';

  const handleImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUploadError('اختر ملف صورة صالحاً.'); return; }
    if (file.size > 25 * 1024 * 1024) { setUploadError('حجم الصورة يتجاوز الحد الأقصى 25MB.'); return; }
    setUploading(true); setUploadError(null); setUploadWarning(file.size > 5 * 1024 * 1024);
    try {
      const headers = await authHeaders();
      const body = new FormData(); body.append('file', file); body.append('title', form.title ?? 'إعلان'); body.append('category', 'other');
      const response = await fetch(`/api/clinic/public-media?clinic_id=${encodeURIComponent(clinicId)}`, { method: 'POST', headers, body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'تعذر رفع الصورة');
      setForm({ ...form, image_url: result.data.public_url });
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'تعذر رفع الصورة'); }
    finally { setUploading(false); }
  };

  const chooseCta = (mode: typeof ctaMode) => {
    setCtaMode(mode);
    setForm({ ...form, cta_link: mode === 'booking' ? bookingUrl : mode === 'none' ? null : mode === 'whatsapp' ? (phoneTarget ? `https://wa.me/${phoneTarget.replace(/\D/g, '')}` : '') : mode === 'phone' ? (phoneTarget ? `tel:${phoneTarget}` : '') : form.cta_link ?? '' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22 }} className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">{ad ? ' تعديل الإعلان' : 'إنشاء إعلان جديد'}</h2><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">✕</button></div>
        <form onSubmit={onSubmit} className="grid max-h-[78vh] gap-6 overflow-y-auto lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">العنوان<input type="text" required value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" /></label>
            {(form.title?.length ?? 0) > 60 && <p className="text-sm text-amber-700">⚠️ العنوان طويل — حاول ألا يتجاوز 60 حرفاً.</p>}
            <label className="block text-sm font-medium text-slate-700">الوصف (اختياري)<textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" /></label>
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void handleImage(e.dataTransfer.files[0]); }} className={`rounded-2xl border-2 border-dashed p-4 ${dragging ? 'border-violet-500 bg-violet-50' : 'border-slate-300'}`}>
              <input ref={fileInput} hidden type="file" accept="image/*" onChange={(e) => void handleImage(e.target.files?.[0])} />
              {form.image_url ? <img src={form.image_url} alt={form.title ?? 'معاينة الإعلان'} className="mb-3 h-36 w-full rounded-xl object-cover" /> : null}
              {uploading ? <Skeleton className="mb-3 h-24 w-full" /> : null}
              {form.image_url ? <button disabled={uploading} type="button" onClick={() => fileInput.current?.click()} className="ml-2 text-sm text-violet-700 disabled:opacity-50">🔄 استبدال</button> : <button disabled={uploading} type="button" onClick={() => fileInput.current?.click()} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">📁 اختر صورة</button>}
              {form.image_url ? <button type="button" onClick={() => setForm({ ...form, image_url: null })} className="text-sm text-rose-700">🗑 إزالة من الإعلان</button> : null}
              <p className="mt-2 text-xs text-slate-500">أو اسحب الصورة وأفلتها هنا (حد 25MB).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setIsLibraryOpen(true)} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
                  اختر من المكتبة
                </button>
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="rounded-full bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  رفع صورة جديدة
                </button>
              </div>
              {uploadWarning && <p className="text-xs text-amber-700">⚠️ الصورة كبيرة وقد يستغرق رفعها وقتاً.</p>}
              {uploadError && <p role="alert" className="mt-2 text-sm text-rose-700">{uploadError}</p>}
            </div>
            {isLibraryOpen && (
              <ClinicMediaLibrary
                mode="select"
                onClose={() => setIsLibraryOpen(false)}
                onSelect={(item) => {
                  setForm({ ...form, image_url: item.public_url });
                  setIsLibraryOpen(false);
                  setUploadError(null);
                }}
              />
            )}
            {form.image_url && <details><summary className="cursor-pointer text-sm text-slate-600">خيارات متقدمة: رابط الصورة</summary><input type="url" value={form.image_url ?? ''} onChange={(e) => setForm({ ...form, image_url: e.target.value || null })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800" /></details>}
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-slate-700">وجهة زر الإعلان</legend>
              {([['url','🔗 صفحة/موقع'],['whatsapp','💬 واتساب'],['phone','📞 هاتف'],['booking','📅 صفحة الحجز'],['none','❌ بلا زر']] as const).map(([value,label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-2 text-sm text-slate-700 hover:border-violet-300"><input type="radio" name="cta-mode" checked={ctaMode === value} onChange={() => chooseCta(value)} className="accent-violet-600" />{label}</label>)}
              {ctaMode === 'url' && <input type="url" value={form.cta_link ?? ''} onChange={(e) => setForm({ ...form, cta_link: e.target.value || null })} placeholder="https://example.com" className="w-full rounded-xl border border-slate-200 px-3 py-2" />}
              {(ctaMode === 'whatsapp' || ctaMode === 'phone') && <input type="tel" value={phoneTarget} onChange={(e) => { const value=e.target.value; setPhoneTarget(value); setForm({ ...form, cta_link: ctaMode === 'whatsapp' ? `https://wa.me/${value.replace(/\D/g,'')}` : `tel:${value}` }); }} placeholder="رقم الهاتف" className="w-full rounded-xl border border-slate-200 px-3 py-2" />}
              {ctaMode === 'whatsapp' && phoneTarget.replace(/\D/g, '').length < 10 && <p className="text-xs text-amber-700">⚠️ رقم واتساب يبدو ناقصاً.</p>}
            </fieldset>
            <label className="block text-sm text-slate-700">نص الزر<input value={form.cta_text ?? ''} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />نشط</label>
            <div className="flex gap-3"><Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>إلغاء</Button><Button variant="primary" type="submit" loading={submitting}>حفظ الإعلان</Button></div>
          </div>
          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="mb-3 text-sm font-bold text-slate-700">معاينة مباشرة</h3><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">{form.image_url ? <img src={form.image_url} alt="" className="h-44 w-full object-cover" /> : <div className="grid h-44 place-items-center bg-gradient-to-br from-violet-100 to-cyan-100 text-4xl">📢</div>}<div className="p-4"><h4 className="font-bold text-slate-900">{form.title || 'عنوان الإعلان'}</h4><p className="mt-2 text-sm text-slate-600">{form.description || 'وصف الإعلان سيظهر هنا.'}</p>{ctaMode !== 'none' && <span className="mt-4 inline-block rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">{form.cta_text || 'إقرأ المزيد'}</span>}</div></div></aside>
          </form>
      </motion.div>
    </div>
  );
}
