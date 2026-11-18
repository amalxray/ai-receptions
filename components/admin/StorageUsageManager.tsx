'use client';

import { useCallback, useEffect, useState } from 'react';

type ProjectUsage = {
  total_bytes: number;
  object_count: number;
  unknown_size_object_count: number;
  unclassified_bytes: number;
  unclassified_object_count: number;
  measured_at: string;
  capacity_bytes: number | null;
  percent_used: number | null;
};

type ClinicUsage = {
  clinic_id: string;
  clinic_name: string;
  usage: { total_bytes: number; object_count: number; unknown_size_object_count: number; measured_at: string } | null;
  limit: {
    soft_limit_bytes: number;
    warning_percent: number;
    notification_email: string | null;
    last_alert_sent_at: string | null;
    percent_used: number | null;
  } | null;
};

type UsageResponse = {
  data: {
    project: ProjectUsage | null;
    project_capacity_configured: boolean;
    clinics: ClinicUsage[];
  };
};

export default function StorageUsageManager() {
  const [data, setData] = useState<UsageResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingClinic, setSavingClinic] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/storage-usage', { cache: 'no-store' });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.data) throw new Error(json?.error || 'تعذر تحميل بيانات التخزين');
    setData(json.data as UsageResponse['data']);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [load]);

  async function saveLimit(clinic: ClinicUsage, formData: FormData) {
    const softLimitGiB = Number(formData.get('soft_limit_gib'));
    const warningPercent = Number(formData.get('warning_percent'));
    const email = String(formData.get('notification_email') ?? '').trim();
    if (!Number.isFinite(softLimitGiB) || softLimitGiB <= 0 || !Number.isInteger(warningPercent)) {
      setError('أدخل حدًا موجبًا بالـGiB ونسبة تنبيه صحيحة.');
      return;
    }

    setSavingClinic(clinic.clinic_id);
    setError(null);
    try {
      const response = await fetch('/api/admin/storage-usage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinic.clinic_id,
          soft_limit_bytes: Math.round(softLimitGiB * 1024 ** 3),
          warning_percent: warningPercent,
          notification_email: email || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error || 'تعذر حفظ الحد');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingClinic(null);
    }
  }

  if (!data && !error) {
    return <p className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">جارٍ تحميل بيانات التخزين...</p>;
  }

  const project = data?.project;
  return (
    <section className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="استخدام المشروع" value={project ? formatBytes(project.total_bytes) : 'لا توجد لقطة'} />
        <MetricCard
          title="سعة المشروع المهيأة"
          value={data?.project_capacity_configured && project?.capacity_bytes
            ? formatBytes(project.capacity_bytes)
            : 'غير مهيأة'}
          detail="لا يفترض النظام حدًا افتراضيًا؛ أضف السعة الفعلية من خطة Supabase إلى متغير البيئة."
        />
        <MetricCard
          title="ملفات غير مصنفة"
          value={project ? formatBytes(project.unclassified_bytes) : 'لا توجد لقطة'}
          detail={project
            ? `${project.unclassified_object_count.toLocaleString()} عنصرًا · غير منسوب إلى منشأة آليًا`
            : undefined}
        />
      </div>

      {project?.measured_at && (
        <p className="text-xs text-slate-500">
          آخر قياس: {new Date(project.measured_at).toLocaleString('ar')}
          {project.percent_used !== null ? ` · ${project.percent_used.toFixed(1)}% من السعة المهيأة` : ''}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
        <table className="min-w-[900px] w-full text-right text-sm">
          <thead className="bg-slate-800/70 text-xs text-slate-400">
            <tr>
              <th className="p-3">المنشأة</th>
              <th className="p-3">الاستخدام / الملفات</th>
              <th className="p-3">الحد الاختياري</th>
              <th className="p-3">آخر قياس</th>
              <th className="p-3">إعداد التنبيه</th>
            </tr>
          </thead>
          <tbody>
            {(data?.clinics ?? []).map((clinic) => (
              <tr key={clinic.clinic_id} className="border-t border-slate-800 align-top">
                <td className="p-3 font-semibold text-slate-100">{clinic.clinic_name}</td>
                <td className="p-3 text-slate-300">
                  {clinic.usage
                    ? <>{formatBytes(clinic.usage.total_bytes)}<span className="block text-xs text-slate-500">{clinic.usage.object_count.toLocaleString()} ملف
                      {clinic.usage.unknown_size_object_count > 0 && ` · حجم ${clinic.usage.unknown_size_object_count.toLocaleString()} غير معروف`}</span></>
                    : 'لا توجد لقطة'}
                  {clinic.limit && clinic.limit.percent_used !== null && (
                    <span className="mt-1 block text-xs text-amber-300">{clinic.limit.percent_used.toFixed(1)}% من الحد</span>
                  )}
                </td>
                <td className="p-3 text-slate-300">
                  {clinic.limit ? `${formatBytes(clinic.limit.soft_limit_bytes)} · تنبيه عند ${clinic.limit.warning_percent}%` : 'غير محدد'}
                  {clinic.limit?.last_alert_sent_at && (
                    <span className="block text-xs text-slate-500">آخر تنبيه: {new Date(clinic.limit.last_alert_sent_at).toLocaleDateString('ar')}</span>
                  )}
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {clinic.usage?.measured_at ? new Date(clinic.usage.measured_at).toLocaleString('ar') : '—'}
                </td>
                <td className="p-3">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveLimit(clinic, new FormData(event.currentTarget));
                    }}
                    className="grid grid-cols-2 gap-2"
                  >
                    <label className="text-xs text-slate-400">
                      حد GiB
                      <input
                        name="soft_limit_gib"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={clinic.limit ? (clinic.limit.soft_limit_bytes / 1024 ** 3).toFixed(2) : ''}
                        required
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      تنبيه عند %
                      <input
                        name="warning_percent"
                        type="number"
                        min="1"
                        max="100"
                        defaultValue={clinic.limit?.warning_percent ?? 80}
                        required
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                      />
                    </label>
                    <label className="col-span-2 text-xs text-slate-400">
                      بريد التنبيه (اختياري)
                      <input
                        name="notification_email"
                        type="email"
                        defaultValue={clinic.limit?.notification_email ?? ''}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={savingClinic === clinic.clinic_id}
                      className="col-span-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
                    >
                      {savingClinic === clinic.clinic_id ? 'جارٍ الحفظ...' : clinic.limit ? 'تحديث الحد' : 'تفعيل التنبيه'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        الحصص اختيارية وتنبيهية فقط. لا تُمنع عمليات الرفع عند تجاوزها. العناصر التي لا يمكن ربط مسارها بمالك موثوق تظهر ضمن غير المصنف ولا تُنسب تخمينًا.
      </p>
    </section>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
      {detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'غير متاح';
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
