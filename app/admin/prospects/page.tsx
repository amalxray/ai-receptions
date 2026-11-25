import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Target } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import ProspectCsvImport from '@/components/admin/ProspectCsvImport';
import ProspectEmailTable from '@/components/admin/ProspectEmailTable';
import ProspectOsmFetch from '@/components/admin/ProspectOsmFetch';
import { countDailyEmailSends, DAILY_EMAIL_LIMIT } from '@/lib/services/prospecting/prospectEmail';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().optional(),
);

const createProspectSchema = z.object({
  clinic_name: z.string().trim().min(2).max(200),
  doctor_name: optionalText,
  phone: optionalText,
  email: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().email().optional(),
  ),
  website: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().url().optional(),
  ),
  address: optionalText,
  city: z.string().trim().min(1),
  country: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? 'PS' : value),
    z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('PS'),
  ),
  notes: optionalText,
});

type Prospect = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  country: string;
  status: string;
  created_at: string;
  metadata: unknown;
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'new', label: 'جديد' },
  { value: 'contacted', label: 'تم التواصل' },
  { value: 'replied', label: 'ردّت' },
  { value: 'meeting', label: 'اجتماع' },
  { value: 'converted', label: 'تم الاشتراك' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'archived', label: 'مؤرشف' },
];

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.filter((option) => option.value !== 'all').map(({ value, label }) => [value, label]),
);

const DATE_FORMATTER = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

async function createProspect(formData: FormData) {
  'use server';

  const gate = await requirePlatformAdmin();
  if (!gate.ok) redirect('/login?next=/admin/prospects');

  const parsed = createProspectSchema.safeParse({
    clinic_name: formValue(formData, 'clinic_name'),
    doctor_name: formValue(formData, 'doctor_name'),
    phone: formValue(formData, 'phone'),
    email: formValue(formData, 'email'),
    website: formValue(formData, 'website'),
    address: formValue(formData, 'address'),
    city: formValue(formData, 'city'),
    country: formValue(formData, 'country') || 'PS',
    notes: formValue(formData, 'notes'),
  });
  if (!parsed.success) redirect('/admin/prospects?error=invalid');

  const { error } = await supabaseAdmin.from('prospects').insert({
    ...parsed.data,
    source: 'manual',
    source_id: null,
    status: 'new',
  });
  if (error) {
    redirect(`/admin/prospects?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admin/prospects');
  redirect('/admin/prospects?notice=created');
}

async function archiveProspect(formData: FormData) {
  'use server';

  const gate = await requirePlatformAdmin();
  if (!gate.ok) redirect('/login?next=/admin/prospects');

  const id = z.string().uuid().safeParse(formValue(formData, 'id'));
  if (!id.success) redirect('/admin/prospects?error=invalid-id');

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .update({ status: 'archived' })
    .eq('id', id.data)
    .select('id')
    .maybeSingle();
  if (error) {
    redirect(`/admin/prospects?error=${encodeURIComponent(error.message)}`);
  }
  if (!data) redirect('/admin/prospects?error=not-found');

  revalidatePath('/admin/prospects');
  redirect('/admin/prospects?notice=archived');
}

export default async function AdminProspectsPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; notice?: string; error?: string };
}) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) redirect('/login?next=/admin/prospects');

  const status = STATUS_OPTIONS.some((option) => option.value === searchParams?.status)
    ? searchParams?.status
    : 'all';
  const query = searchParams?.q?.trim() ?? '';

  let prospectsQuery = supabaseAdmin
    .from('prospects')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') prospectsQuery = prospectsQuery.eq('status', status);

  const [{ data, error }, { count: totalCount, error: countError }, { data: newRows, error: newRowsError }, dailyEmailCount] = await Promise.all([
    prospectsQuery,
    supabaseAdmin.from('prospects').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('prospects').select('id').eq('status', 'new').limit(50),
    countDailyEmailSends(),
  ]);
  if (error) throw new Error(`تعذّر تحميل العيادات المحتملة: ${error.message}`);
  if (countError) throw new Error(`تعذّر تحميل العدد الإجمالي: ${countError.message}`);
  if (newRowsError) throw new Error(`تعذّر تحميل العيادات الجديدة: ${newRowsError.message}`);

  const prospects = ((data ?? []) as Prospect[]).filter((prospect) =>
    !query || prospect.clinic_name.toLocaleLowerCase('ar').includes(query.toLocaleLowerCase('ar')),
  );
  const notice = searchParams?.notice;
  const actionError = searchParams?.error;
  const tableProspects = prospects.map((prospect) => ({
    ...prospect,
    created_at_label: DATE_FORMATTER.format(new Date(prospect.created_at)),
  }));

  return (
    <div dir="rtl" className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-bold text-white">
              <Target className="h-6 w-6 text-amber-300" />
              العيادات المحتملة
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {totalCount ?? 0} جهة في القائمة · يعرض الجدول حتى 200 من الأحدث.
            </p>
            <p className="mt-1 text-xs text-amber-200/80">اليوم: {dailyEmailCount}/{DAILY_EMAIL_LIMIT} إرسال</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProspectCsvImport />
            <ProspectOsmFetch />
            <details className="group">
              <summary className="cursor-pointer list-none rounded-xl bg-amber-400 px-5 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300">
                + إضافة عيادة
              </summary>
              <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
                <a
                  href="/admin/prospects"
                  aria-label="إغلاق نموذج إضافة عيادة"
                  className="absolute inset-0"
                />
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="prospect-form-title"
                  className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
                >
                <h2 id="prospect-form-title" className="text-lg font-bold text-white">
                  إضافة عيادة محتملة
                </h2>
                <p className="mt-1 text-sm text-slate-400">الحقول ذات علامة * مطلوبة.</p>
                <form action={createProspect} className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>اسم العيادة *</span>
                      <input
                        name="clinic_name"
                        required
                        minLength={2}
                        maxLength={200}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>اسم الطبيب</span>
                      <input
                        name="doctor_name"
                        maxLength={200}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>الهاتف</span>
                      <input
                        name="phone"
                        type="tel"
                        maxLength={50}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>البريد الإلكتروني</span>
                      <input
                        name="email"
                        type="email"
                        maxLength={254}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>الموقع الإلكتروني</span>
                      <input
                        name="website"
                        type="url"
                        maxLength={2048}
                        placeholder="https://example.com"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>المدينة *</span>
                      <input
                        name="city"
                        required
                        maxLength={120}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span>الدولة (رمز ISO من حرفين)</span>
                      <input
                        name="country"
                        defaultValue="PS"
                        required
                        minLength={2}
                        maxLength={2}
                        pattern="[A-Za-z]{2}"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white uppercase outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
                      <span>العنوان</span>
                      <input
                        name="address"
                        maxLength={500}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
                      <span>ملاحظات</span>
                      <textarea
                        name="notes"
                        rows={3}
                        maxLength={4000}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-400"
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-3">
                    <a
                      href="/admin/prospects"
                      className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
                    >
                      إلغاء
                    </a>
                    <button
                      type="submit"
                      className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"
                    >
                      حفظ العيادة
                    </button>
                  </div>
                </form>
                </section>
              </div>
            </details>
          </div>
        </div>

        {notice === 'created' && (
          <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            تمت إضافة العيادة بنجاح.
          </p>
        )}
        {notice === 'archived' && (
          <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            تم أرشفة العيادة.
          </p>
        )}
        {actionError && (
          <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {actionError === 'invalid'
              ? 'تحقق من الحقول المطلوبة وصحة البريد الإلكتروني والموقع الإلكتروني.'
              : actionError === 'invalid-id'
                ? 'معرّف العيادة غير صالح.'
                : actionError === 'not-found'
                  ? 'لم يتم العثور على العيادة.'
                  : actionError}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/50">
        <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row">
          <label className="sr-only" htmlFor="prospect-status">فلترة حسب الحالة</label>
          <select
            id="prospect-status"
            name="status"
            defaultValue={status}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="prospect-search">بحث باسم العيادة</label>
          <input
            id="prospect-search"
            name="q"
            defaultValue={query}
            placeholder="ابحث باسم العيادة…"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            تطبيق الفلاتر
          </button>
        </form>

        {prospects.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">
            لا توجد عيادات بعد — أضف أول عيادة
          </p>
        ) : (
          <ProspectEmailTable
            prospects={tableProspects}
            newProspectIds={(newRows ?? []).map((row) => row.id)}
            statusLabels={STATUS_LABELS}
            archiveProspect={archiveProspect}
          />
        )}
      </section>
    </div>
  );
}
