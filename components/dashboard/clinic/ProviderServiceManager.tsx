'use client';

import { useEffect, useState } from 'react';
import { Clock3, MoreVertical } from 'lucide-react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { formatMoney } from '@/lib/clinic/formatting';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';

type Provider = { id: string; name: string; title: string | null; provider_type: string; active: boolean };
type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price: number | null;
  pricing_type: 'unspecified' | 'fixed' | 'estimate' | 'range' | 'case_by_case';
  price_min: number | null;
  price_max: number | null;
  active: boolean;
};

type Mode = 'providers' | 'services';
type PricingChoice = 'fixed' | 'range';
type FormValues = {
  name: string;
  title: string;
  provider_type: string;
  description: string;
  duration_minutes: string;
  pricing_type: PricingChoice;
  price: string;
  price_min: string;
  price_max: string;
};
type FieldErrors = Partial<Record<keyof FormValues, string>>;
type ApiFieldIssue = { path?: Array<string | number>; message?: string };
type ApiErrorBody = { error?: string; details?: ApiFieldIssue[] };

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-200';
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';
const fieldErrorClass = 'mt-1.5 text-sm text-red-300';

function emptyForm(): FormValues {
  return {
    name: '',
    title: '',
    provider_type: 'dentist',
    description: '',
    duration_minutes: '30',
    pricing_type: 'fixed',
    price: '',
    price_min: '',
    price_max: '',
  };
}

function validateForm(form: FormValues, mode: Mode): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = 'أدخل الاسم.';
  else if (form.name.trim().length > 200) errors.name = 'يجب ألا يتجاوز الاسم 200 حرف.';

  if (mode === 'services') {
    if (form.description.length > 1000) errors.description = 'يجب ألا يتجاوز الوصف 1000 حرف.';
    const duration = Number(form.duration_minutes);
    if (!form.duration_minutes.trim() || !Number.isInteger(duration) || duration < 5 || duration > 480) {
      errors.duration_minutes = 'أدخل مدة صحيحة بين 5 و480 دقيقة.';
    }

    if (form.pricing_type === 'fixed') {
      const price = Number(form.price);
      if (!form.price.trim() || !Number.isFinite(price) || price < 0) {
        errors.price = 'أدخل سعراً صحيحاً غير سالب.';
      }
    } else {
      const min = Number(form.price_min);
      const max = Number(form.price_max);
      if (!form.price_min.trim() || !Number.isFinite(min) || min < 0) {
        errors.price_min = 'أدخل الحد الأدنى للسعر.';
      }
      if (!form.price_max.trim() || !Number.isFinite(max) || max < 0) {
        errors.price_max = 'أدخل الحد الأعلى للسعر.';
      } else if (form.price_min.trim() && Number.isFinite(min) && max < min) {
        errors.price_max = 'يجب ألا يقل السعر الأعلى عن السعر الأدنى.';
      }
    }
  }

  return errors;
}

function mapServerIssues(issues: ApiFieldIssue[] | undefined): FieldErrors {
  const mapped: FieldErrors = {};
  const messages: Record<string, string> = {
    name: 'تحقق من الاسم؛ يجب أن يكون بين حرف واحد و200 حرف.',
    description: 'يجب ألا يتجاوز الوصف 1000 حرف.',
    duration_minutes: 'أدخل مدة صحيحة بين 5 و480 دقيقة.',
    price: 'أدخل سعراً صحيحاً غير سالب.',
    price_min: 'أدخل الحد الأدنى للسعر بشكل صحيح.',
    price_max: 'أدخل حداً أعلى لا يقل عن الحد الأدنى.',
  };

  for (const issue of issues ?? []) {
    const field = String(issue.path?.[0] ?? '');
    if (field in messages) mapped[field as keyof FormValues] = messages[field];
  }
  return mapped;
}

function serverErrorMessage(status: number, message?: string): string {
  if (status === 401 || status === 403) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء.';
  if (status === 409 || message?.includes('SERVICE_NAME_TAKEN') || message?.includes('already exists')) {
    return 'توجد خدمة أخرى بالاسم نفسه.';
  }
  return 'تعذر حفظ البيانات. تحقق من الحقول وحاول مرة أخرى.';
}

function providerTypeLabel(providerType: string): string {
  if (providerType === 'dentist') return 'طبيب أسنان';
  if (providerType === 'hygienist') return 'أخصائي صحة أسنان';
  if (providerType === 'staff') return 'موظف';
  return 'مقدم خدمة';
}

function servicePriceLabel(service: Service): string {
  if (service.pricing_type === 'range' && service.price_min != null && service.price_max != null) {
    return `${formatMoney(service.price_min, 'ILS')} - ${formatMoney(service.price_max, 'ILS')}`;
  }
  if (service.price != null) return formatMoney(service.price, 'ILS');
  if (service.pricing_type === 'case_by_case') return 'يحدد حسب الحالة';
  if (service.pricing_type === 'estimate') return 'سعر تقديري';
  return 'السعر غير محدد';
}

export default function ProviderServiceManager({ mode }: { mode: Mode }) {
  const {
    isConfigured: isSupabaseConfigured,
    loading: configLoading,
    checkFailed,
  } = useSupabaseConfig();
  const {
    clinicId,
    authHeaders,
    loading: clinicLoading,
    error: clinicError,
  } = useClinicContext();
  const [items, setItems] = useState<Array<Provider | Service>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const endpoint = mode === 'providers' ? '/api/clinic/providers' : '/api/clinic/services';

  async function load() {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      if (!res.ok) throw new Error('تعذر تحميل البيانات. حاول مرة أخرى.');
      const body = await res.json() as { data?: Array<Provider | Service> };
      setItems(body.data ?? []);
    } catch {
      setError('تعذر تحميل البيانات. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (configLoading) { setLoading(true); return; }
    if (!isSupabaseConfigured && !checkFailed) { setLoading(false); return; }
    if (clinicLoading) { setLoading(true); return; }
    if (!clinicId) {
      if (clinicError) setError('تعذر تحديد العيادة الحالية.');
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured, configLoading, checkFailed, clinicLoading, clinicId]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFieldErrors({});
    setError(null);
    setIsFormOpen(true);
  }

  function openEdit(item: Provider | Service) {
    setEditingId(item.id);
    setFieldErrors({});
    setError(null);
    if ('provider_type' in item) {
      setForm({ ...emptyForm(), name: item.name, title: item.title ?? '', provider_type: item.provider_type });
    } else {
      setForm({
        ...emptyForm(),
        name: item.name,
        description: item.description ?? '',
        duration_minutes: item.duration_minutes == null ? '' : String(item.duration_minutes),
        pricing_type: item.pricing_type === 'range' ? 'range' : 'fixed',
        price: item.price == null ? '' : String(item.price),
        price_min: item.price_min == null ? '' : String(item.price_min),
        price_max: item.price_max == null ? '' : String(item.price_max),
      });
    }
    setIsFormOpen(true);
  }

  function updateField(field: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errors = validateForm(form, mode);
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    if (!clinicId) {
      setError('تعذر تحديد العيادة الحالية.');
      return;
    }

    const payload = mode === 'providers'
      ? { name: form.name.trim(), title: form.title.trim(), provider_type: form.provider_type }
      : {
        name: form.name.trim(),
        description: form.description.trim() || null,
        duration_minutes: Number(form.duration_minutes),
        pricing_type: form.pricing_type,
        price: form.pricing_type === 'fixed' ? Number(form.price) : null,
        price_min: form.pricing_type === 'range' ? Number(form.price_min) : null,
        price_max: form.pricing_type === 'range' ? Number(form.price_max) : null,
      };

    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const url = editingId
        ? `${endpoint}/${editingId}?clinic_id=${encodeURIComponent(clinicId)}`
        : `${endpoint}?clinic_id=${encodeURIComponent(clinicId)}`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as ApiErrorBody | null;
        const serverFields = mapServerIssues(body?.details);
        setFieldErrors(serverFields);
        setError(serverErrorMessage(res.status, body?.error));
        return;
      }
      setIsFormOpen(false);
      await load();
    } catch {
      setError('تعذر حفظ البيانات. تحقق من اتصالك وحاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(item: Provider | Service) {
    if (!clinicId) return;
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}/${item.id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ active: !item.active }),
      });
      if (!res.ok) throw new Error('تعذر تحديث حالة العنصر.');
      await load();
    } catch {
      setError('تعذر تحديث حالة العنصر. حاول مرة أخرى.');
    }
  }

  async function handleDelete(id: string) {
    const label = mode === 'providers' ? 'مقدم الخدمة' : 'الخدمة';
    if (!clinicId || !window.confirm(`هل أنت متأكد من حذف ${label}؟`)) return;
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${endpoint}/${id}?clinic_id=${encodeURIComponent(clinicId)}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('تعذر حذف العنصر.');
      await load();
    } catch {
      setError('تعذر حذف العنصر. حاول مرة أخرى.');
    }
  }

  if (loading || configLoading) return <Skeleton className="h-60" />;
  if (!isSupabaseConfigured && !checkFailed) return <EmptyState title="قاعدة البيانات غير مُهيّأة" description="فعّل قاعدة بيانات العيادة لإدارة مقدمي الخدمة والخدمات." />;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          {mode === 'providers' ? 'إضافة مقدم خدمة' : 'إضافة خدمة'}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {isFormOpen ? (
        <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h3 className="mb-4 text-lg font-semibold text-white">{editingId ? 'تعديل البيانات' : mode === 'providers' ? 'إضافة مقدم خدمة' : 'إضافة خدمة'}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="service-name" className={labelClass}>{mode === 'providers' ? 'اسم مقدم الخدمة' : 'اسم الخدمة'}</label>
              <input
                id="service-name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                maxLength={200}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'service-name-error' : undefined}
                required
                className={inputClass}
              />
              {fieldErrors.name && <p id="service-name-error" role="alert" className={fieldErrorClass}>{fieldErrors.name}</p>}
            </div>

            {mode === 'providers' ? (
              <>
                <div>
                  <label htmlFor="provider-title" className={labelClass}>المسمى الوظيفي</label>
                  <input id="provider-title" value={form.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="provider-type" className={labelClass}>نوع مقدم الخدمة</label>
                  <select id="provider-type" value={form.provider_type} onChange={(e) => updateField('provider_type', e.target.value)} className={inputClass}>
                    <option value="dentist">طبيب أسنان</option>
                    <option value="hygienist">أخصائي صحة أسنان</option>
                    <option value="staff">موظف</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="md:col-span-2">
                  <label htmlFor="service-description" className={labelClass}>الوصف</label>
                  <textarea
                    id="service-description"
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    maxLength={1000}
                    rows={3}
                    aria-invalid={Boolean(fieldErrors.description)}
                    aria-describedby={fieldErrors.description ? 'service-description-error' : undefined}
                    className={`${inputClass} resize-y`}
                  />
                  {fieldErrors.description && <p id="service-description-error" role="alert" className={fieldErrorClass}>{fieldErrors.description}</p>}
                </div>

                <div>
                  <label htmlFor="service-duration" className={labelClass}>مدة الخدمة</label>
                  <div className={`flex overflow-hidden rounded-xl border bg-slate-950 transition focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 ${fieldErrors.duration_minutes ? 'border-red-400' : 'border-slate-700'}`} dir="rtl">
                    <input
                      id="service-duration"
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={form.duration_minutes}
                      onChange={(e) => updateField('duration_minutes', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.duration_minutes)}
                      aria-describedby={fieldErrors.duration_minutes ? 'service-duration-error' : undefined}
                      className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm text-slate-100 outline-none"
                    />
                    <span className="flex items-center border-r border-slate-700 px-3 text-sm text-slate-400">دقيقة</span>
                  </div>
                  {fieldErrors.duration_minutes && <p id="service-duration-error" role="alert" className={fieldErrorClass}>{fieldErrors.duration_minutes}</p>}
                </div>

                <div>
                  <label htmlFor="pricing-type" className={labelClass}>نوع التسعير</label>
                  <select
                    id="pricing-type"
                    value={form.pricing_type}
                    onChange={(e) => {
                      updateField('pricing_type', e.target.value === 'range' ? 'range' : 'fixed');
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.price;
                        delete next.price_min;
                        delete next.price_max;
                        return next;
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="fixed">سعر ثابت</option>
                    <option value="range">نطاق سعري</option>
                  </select>
                </div>

                {form.pricing_type === 'fixed' ? (
                  <div>
                    <label htmlFor="service-price" className={labelClass}>السعر (شيكل)</label>
                    <input
                      id="service-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.price}
                      onChange={(e) => updateField('price', e.target.value)}
                      aria-invalid={Boolean(fieldErrors.price)}
                      aria-describedby={fieldErrors.price ? 'service-price-error' : undefined}
                      className={inputClass}
                    />
                    {fieldErrors.price && <p id="service-price-error" role="alert" className={fieldErrorClass}>{fieldErrors.price}</p>}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="service-price-min" className={labelClass}>السعر من (شيكل)</label>
                      <input
                        id="service-price-min"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price_min}
                        onChange={(e) => updateField('price_min', e.target.value)}
                        aria-invalid={Boolean(fieldErrors.price_min)}
                        aria-describedby={fieldErrors.price_min ? 'service-price-min-error' : undefined}
                        className={inputClass}
                      />
                      {fieldErrors.price_min && <p id="service-price-min-error" role="alert" className={fieldErrorClass}>{fieldErrors.price_min}</p>}
                    </div>
                    <div>
                      <label htmlFor="service-price-max" className={labelClass}>السعر إلى (شيكل)</label>
                      <input
                        id="service-price-max"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price_max}
                        onChange={(e) => updateField('price_max', e.target.value)}
                        aria-invalid={Boolean(fieldErrors.price_max)}
                        aria-describedby={fieldErrors.price_max ? 'service-price-max-error' : undefined}
                        className={inputClass}
                      />
                      {fieldErrors.price_max && <p id="service-price-max-error" role="alert" className={fieldErrorClass}>{fieldErrors.price_max}</p>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-5 flex gap-3">
            <button type="submit" disabled={submitting} className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60">
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
            <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-full border border-slate-600 bg-transparent px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
              إلغاء
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 && !isFormOpen ? (
        <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/70 px-6 py-10 text-center">
          <p className="text-base font-semibold text-white">{mode === 'providers' ? 'لا يوجد مقدمو خدمة بعد' : 'لا توجد خدمات بعد'}</p>
          <p className="mt-2 text-sm text-slate-300">{mode === 'providers' ? 'أضف أول مقدم خدمة للبدء.' : 'أضف أول خدمة لتكون متاحة للحجز.'}</p>
          <button type="button" onClick={openCreate} className="mt-4 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            {mode === 'providers' ? 'إضافة أول مقدم خدمة' : 'إضافة أول خدمة'}
          </button>
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const service = 'duration_minutes' in item ? item : null;
            const provider = 'provider_type' in item ? item : null;
            return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-800 p-4 shadow-sm shadow-slate-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{item.name}</p>
                    {service ? (
                      <div className="mt-4 flex items-center justify-between gap-3" dir="rtl">
                        <p className="flex items-center gap-1.5 text-sm font-light text-slate-400">
                          <Clock3 size={15} aria-hidden="true" />
                          {service.duration_minutes != null ? `${service.duration_minutes} دقيقة` : 'المدة غير محددة'}
                        </p>
                        <p className="text-base font-bold text-white">{servicePriceLabel(service)}</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-300">{provider?.title || providerTypeLabel(provider?.provider_type ?? '')}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                      {item.active ? 'نشط' : 'غير نشط'}
                    </span>
                    <details className="relative">
                      <summary aria-label={`خيارات ${item.name}`} className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-slate-300 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                        <MoreVertical size={18} aria-hidden="true" />
                      </summary>
                      <div className="absolute left-0 top-full z-10 mt-1 min-w-32 rounded-xl border border-slate-600 bg-slate-900 p-1 shadow-xl">
                        <button type="button" onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          openEdit(item);
                        }} className="block w-full rounded-lg px-3 py-2 text-right text-sm text-slate-200 transition hover:bg-slate-800">
                          تعديل
                        </button>
                        <button type="button" onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          void handleToggle(item);
                        }} className="block w-full rounded-lg px-3 py-2 text-right text-sm text-slate-200 transition hover:bg-slate-800">
                          {item.active ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <button type="button" onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          void handleDelete(item.id);
                        }} className="block w-full rounded-lg px-3 py-2 text-right text-sm text-red-300 transition hover:bg-red-500/10">
                          حذف
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
