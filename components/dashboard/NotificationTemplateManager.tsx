'use client';

import { useEffect, useState } from 'react';
import { useSupabaseConfig } from '@/lib/useSupabaseConfig';
import { useClinicContext } from '@/lib/useClinicContext';
import { pushToast } from '@/components/ui/Toast';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import {
  NOTIFICATION_TEMPLATE_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LANGUAGES,
  type NotificationTemplateType,
  type NotificationChannel,
  type NotificationLanguage,
} from '@/lib/notification/templateContract';

type Template = {
  id: string;
  template_type: NotificationTemplateType;
  channel: NotificationChannel;
  language: NotificationLanguage;
  subject: string | null;
  body: string | null;
};

const TEMPLATE_TYPE_LABELS: Record<NotificationTemplateType, string> = {
  appointment_confirmation: "تأكيد الموعد (Confirmation)",
  appointment_reminder: "تذكير بالموعد (Reminder)",
  appointment_cancellation: "إلغاء الموعد (Cancellation)",
  appointment_rescheduling: "إعادة جدولة الموعد (Rescheduling)",
};

const VARIABLES = [
  "{patient_name}",
  "{clinic_name}",
  "{appointment_date}",
  "{appointment_time}",
  "{service_name}",
  "{provider_name}",
];

export default function NotificationTemplateManager() {
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    template_type: NotificationTemplateType;
    channel: NotificationChannel;
    language: NotificationLanguage;
    subject: string;
    body: string;
  }>({
    template_type: "appointment_confirmation",
    channel: "whatsapp",
    language: "ar",
    subject: "",
    body: "",
  });
  const [selectedChannelTab, setSelectedChannelTab] = useState<NotificationChannel | "all">("all");

  useEffect(() => {
    if (configLoading) {
      setLoading(true);
      return;
    }
    if (!isSupabaseConfigured && !checkFailed) {
      setLoading(false);
      return;
    }
    if (clinicLoading) {
      setLoading(true);
      return;
    }
    if (!clinicId) {
      if (clinicError) setError(clinicError);
      setLoading(false);
      return;
    }
    void load();
  }, [isSupabaseConfigured, configLoading, checkFailed, clinicLoading, clinicId, clinicError]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/notification-templates?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
      if (!res.ok) {
        const text = await res.text();
        setError(text || "فشل تحميل قوالب الإشعارات");
        setTemplates([]);
        return;
      }
      // The route responds with `{ data: [...] }`; older builds returned a bare array.
      const payload = await res.json();
      const rows = Array.isArray(payload) ? payload : payload?.data;
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.message || "فشل الاتصال بالخادم");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      template_type: "appointment_confirmation",
      channel: "whatsapp",
      language: "ar",
      subject: "",
      body: "",
    });
    setFormOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      template_type: t.template_type,
      channel: t.channel,
      language: t.language,
      subject: t.subject || "",
      body: t.body || "",
    });
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const headers = await authHeaders();
      headers["Content-Type"] = "application/json";
      const payload = {
        clinic_id: clinicId,
        template_type: form.template_type,
        channel: form.channel,
        language: form.language,
        subject: form.subject || null,
        body: form.body || null,
      };
      const url = editingId
        ? `/api/clinic/notification-templates/${editingId}?clinic_id=${encodeURIComponent(clinicId)}`
        : `/api/clinic/notification-templates?clinic_id=${encodeURIComponent(clinicId)}`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || (editingId ? "تعذر تعديل القالب" : "تعذر حفظ القالب");
        pushToast({
          type: "error",
          title: "خطأ في حفظ القالب",
          message: errMsg,
        });
        return;
      }

      pushToast({
        type: "success",
        title: editingId ? "تم تعديل القالب" : "تم حفظ القالب",
        message: "تم تحديث قوالب الإشعارات بنجاح.",
      });
      setFormOpen(false);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء الحفظ";
      pushToast({
        type: "error",
        title: "خطأ في الاتصال",
        message: msg,
      });
    }
  }

  async function remove(id: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/notification-templates/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        pushToast({
          type: "error",
          title: "خطأ في حذف القالب",
          message: errData.error || "تعذر حذف القالب",
        });
        return;
      }
      pushToast({
        type: "success",
        title: "تم حذف القالب",
        message: "تمت إزالة القالب بنجاح.",
      });
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء الحذف";
      pushToast({
        type: "error",
        title: "خطأ في الاتصال",
        message: msg,
      });
    }
  }

  const insertVariable = (variable: string) => {
    setForm((f) => ({
      ...f,
      body: f.body + (f.body.length > 0 && !f.body.endsWith(" ") ? " " : "") + variable,
    }));
  };

  const filteredTemplates = selectedChannelTab === "all"
    ? templates
    : templates.filter((t) => t.channel === selectedChannelTab);

  if (loading || configLoading) return <Skeleton className="h-60" />;
  if (!isSupabaseConfigured && !checkFailed) {
    return (
      <EmptyState
        title="Supabase is not configured"
        description="Enable your clinic backend to manage templates."
      />
    );
  }
  if (error && templates.length === 0) {
    return <EmptyState title="الخدمة غير متوفرة" description={error} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Channel filter tabs */}
        <div className="flex rounded-2xl border border-slate-800 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => setSelectedChannelTab("all")}
            className={`rounded-xl px-4 py-1.5 text-xs font-medium transition ${
              selectedChannelTab === "all" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setSelectedChannelTab("whatsapp")}
            className={`rounded-xl px-4 py-1.5 text-xs font-medium transition ${
              selectedChannelTab === "whatsapp" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            واتساب WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setSelectedChannelTab("sms")}
            className={`rounded-xl px-4 py-1.5 text-xs font-medium transition ${
              selectedChannelTab === "sms" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            رسائل SMS
          </button>
          <button
            type="button"
            onClick={() => setSelectedChannelTab("email")}
            className={`rounded-xl px-4 py-1.5 text-xs font-medium transition ${
              selectedChannelTab === "email" ? "bg-cyan-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
            }`}
          >
            بريد Email
          </button>
        </div>

        {!formOpen && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            + إضافة قالب جديد
          </button>
        )}
      </div>

      {formOpen ? (
        <form onSubmit={submit} className="rounded-[1.5rem] border border-slate-800 bg-slate-950/90 p-6 shadow-xl">
          <h3 className="mb-4 text-base font-bold text-white">
            {editingId ? "تعديل قالب الإشعار" : "إنشاء قالب إشعار جديد"}
          </h3>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">نوع الإشعار (Template Type)</label>
                <select
                  value={form.template_type}
                  onChange={(e) => setForm((f) => ({ ...f, template_type: e.target.value as NotificationTemplateType }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  {NOTIFICATION_TEMPLATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TEMPLATE_TYPE_LABELS[type] || type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">القناة (Channel)</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as NotificationChannel }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch === "whatsapp" ? "واتساب WhatsApp" : ch === "sms" ? "رسالة نصية SMS" : "بريد إلكتروني Email"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">اللغة (Language)</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as NotificationLanguage }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  {NOTIFICATION_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang === "ar" ? "العربية (Arabic)" : "الإنجليزية (English)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.channel === "email" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">عنوان الرسالة (Subject)</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="مثال: تأكيد موعدك لدى العيادة"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-400">نص الرسالة (Body)</label>
                <span className="text-[11px] text-slate-500">انقر لإدراج المتغيرات:</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-mono text-cyan-300 transition hover:bg-slate-700 hover:text-cyan-200"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="اكتب نص القالب هنا واستخدم المتغيرات أعلاه..."
                rows={5}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none font-sans leading-relaxed"
              />
            </div>

            {/* Live Preview */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
              <span className="mb-2 block text-xs font-semibold text-cyan-400">معاينة مباشرة (Live Preview):</span>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {form.subject && form.channel === "email" && (
                  <div className="mb-2 border-b border-slate-800 pb-2 font-bold text-white">
                    {form.subject
                      .replace("{patient_name}", "أحمد محمد")
                      .replace("{clinic_name}", "عيادة الأمل")}
                  </div>
                )}
                {form.body
                  ? form.body
                      .replace(/{patient_name}/g, "أحمد محمد")
                      .replace(/{clinic_name}/g, "عيادة الأمل")
                      .replace(/{appointment_date}/g, "2026-10-15")
                      .replace(/{appointment_time}/g, "10:30 صباحاً")
                      .replace(/{service_name}/g, "كشف عام")
                      .replace(/{provider_name}/g, "د. سارة")
                  : <span className="text-slate-500">اكتب نصاً في الحقل أعلاه للمعاينة...</span>}
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              حفظ القالب
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-full border border-slate-700 px-5 py-2 text-sm text-slate-300 transition hover:bg-slate-900"
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : null}

      {filteredTemplates.length === 0 ? (
        <EmptyState
          title="لا توجد قوالب"
          description="أنشئ قوالب إشعارات مخصصة لإرسال تأكيدات وتذكيرات للمرضى عبر الواتساب والرسائل النصية والبريد."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((t) => (
            <div key={t.id} className="flex flex-col justify-between rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {TEMPLATE_TYPE_LABELS[t.template_type] || t.template_type}
                    </span>
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300 uppercase">
                      {t.language}
                    </span>
                  </div>
                  {t.subject && <p className="mt-1 text-xs text-slate-400 font-medium">العنوان: {t.subject}</p>}
                  {t.body && (
                    <p className="mt-2 text-xs text-slate-400 line-clamp-3 leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 font-mono">
                      {t.body}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    t.channel === "whatsapp"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                      : t.channel === "sms"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                      : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"
                  }`}
                >
                  {t.channel === "whatsapp" ? "WhatsApp" : t.channel === "sms" ? "SMS" : "Email"}
                </span>
              </div>
              <div className="mt-4 flex justify-end gap-3 border-t border-slate-800/80 pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="font-medium text-cyan-400 hover:text-cyan-300 transition"
                >
                  تعديل
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="font-medium text-red-400 hover:text-red-300 transition"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
