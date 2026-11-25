'use client';

import { useState } from 'react';
import { Archive, Loader2, Mail, MessageCircle, Send, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { buildWhatsAppHref, normalizePhoneForWhatsApp } from '@/lib/utils/whatsapp';

type ProspectRow = {
  id: string;
  clinic_name: string;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  country: string;
  status: string;
  created_at: string;
  created_at_label: string;
  metadata: unknown;
};

type Props = {
  prospects: ProspectRow[];
  newProspectIds: string[];
  statusLabels: Record<string, string>;
  archiveProspect: (formData: FormData) => Promise<void>;
};

type BatchResult = { sent: number; failed: number };

const COUNTRY_CALLING_CODES: Record<string, string> = {
  PS: '970',
  JO: '962',
  SA: '966',
  AE: '971',
};

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const SHORT_ARABIC_MONTHS: Record<string, string> = {
  يناير: 'ينا',
  فبراير: 'فبر',
  مارس: 'مار',
  أبريل: 'أبر',
  مايو: 'ماي',
  يونيو: 'يون',
  يوليو: 'يول',
  أغسطس: 'أغس',
  سبتمبر: 'سبت',
  أكتوبر: 'أكت',
  نوفمبر: 'نوف',
  ديسمبر: 'ديس',
};

const DEFAULT_WHATSAPP_MESSAGE = `مرحباً فريق {clinic_name}،

Dentairec — نظام إدارة عيادات متكامل، يجمع كل ما تحتاجه في منصة واحدة:

🏥 إدارة المرضى والملفات الطبية
📅 حجز المواعيد تلقائياً (24/7)
💰 الفواتير والمدفوعات والتقارير المالية
🩻 تحليل الأشعة بالذكاء الاصطناعي
📊 التقارير والتحليلات
👥 إدارة الفريق والرواتب
💬 شات ذكي للرد على المرضى
📣 أدوات تسويق مدمجة
🌐 صفحة عامة احترافية لعيادتك

المميزات:
✅ يعمل على مدار الساعة
✅ واجهة عربية سهلة
✅ يوفر وقت فريقك
✅ يقلل الأخطاء

هل يناسبكم عرض توضيحي قصير (15 دقيقة)؟

فريق Dentairec
info@dentairec.com
+970569509093`;

function normalizedProspectPhone(prospect: ProspectRow): string | null {
  const phone = prospect.phone?.trim();
  if (!phone) return null;

  const countryCode = COUNTRY_CALLING_CODES[prospect.country.toUpperCase()];
  if (/^0/.test(phone) && !countryCode) return null;

  return normalizePhoneForWhatsApp(phone, countryCode ?? '970');
}

function whatsappSendCount(metadata: unknown): number {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return 0;
  const count = (metadata as Record<string, unknown>).whatsapp_sent;
  return typeof count === 'number' && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;
}

function shortDate(createdAt: string, fallback: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return fallback;

  const parts = SHORT_DATE_FORMATTER.formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!day || !month) return fallback;

  return `${day} ${SHORT_ARABIC_MONTHS[month] ?? month.slice(0, 3)}`;
}

export default function ProspectEmailTable({ prospects, newProspectIds, statusLabels, archiveProspect }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<ProspectRow | null>(null);
  const [whatsappTarget, setWhatsappTarget] = useState<ProspectRow | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappStep, setWhatsappStep] = useState<'compose' | 'follow-up'>('compose');
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'single' | 'ai' | 'batch' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = prospects.length > 0 && prospects.every((prospect) => selectedIds.includes(prospect.id));

  function toggleAll() {
    setSelectedIds(allSelected ? [] : prospects.map((prospect) => prospect.id));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function openEmail(prospect: ProspectRow) {
    setTarget(prospect);
    setSubject(`اقتراح لتحسين تواصل ${prospect.clinic_name} مع المرضى`);
    setBody('');
    setNotice(null);
    setError(null);
  }

  function closeEmail() {
    if (busy === 'single' || busy === 'ai') return;
    setTarget(null);
    setNotice(null);
    setError(null);
  }

  function openWhatsApp(prospect: ProspectRow) {
    setWhatsappTarget(prospect);
    setWhatsappMessage(DEFAULT_WHATSAPP_MESSAGE.replace('{clinic_name}', prospect.clinic_name));
    setWhatsappStep('compose');
    setWhatsappError(null);
  }

  function closeWhatsApp() {
    if (whatsappBusy) return;
    setWhatsappTarget(null);
    setWhatsappError(null);
  }

  async function updateWhatsAppAction(action: 'opened' | 'replied' | 'no_reply' | 'rejected') {
    if (!whatsappTarget || whatsappBusy) return;
    setWhatsappBusy(true);
    setWhatsappError(null);
    try {
      const response = await fetch(`/api/admin/prospects/${whatsappTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر تحديث حالة التواصل.');

      router.refresh();
      if (action === 'opened') {
        setWhatsappStep('follow-up');
      } else {
        const messages = {
          replied: 'تم تسجيل الرد.',
          no_reply: 'تم تسجيل عدم الرد.',
          rejected: 'تم تسجيل أن العيادة غير مهتمة.',
        };
        setWhatsappTarget(null);
        setNotice(messages[action]);
      }
    } catch (caughtError) {
      setWhatsappError(caughtError instanceof Error ? caughtError.message : 'تعذر تحديث حالة التواصل.');
    } finally {
      setWhatsappBusy(false);
    }
  }

  function openWhatsAppChat() {
    if (!whatsappTarget || whatsappBusy) return;
    const phone = normalizedProspectPhone(whatsappTarget);
    if (!phone) {
      setWhatsappError('تعذر تنسيق الرقم. تحقق من الرقم وبلد العيادة.');
      return;
    }
    const href = buildWhatsAppHref(phone, whatsappMessage);
    if (!href) {
      setWhatsappError('تعذر إنشاء رابط WhatsApp لهذا الرقم.');
      return;
    }

    const whatsappWindow = window.open(href, '_blank');
    if (!whatsappWindow) {
      setWhatsappError('تعذر فتح نافذة WhatsApp. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      return;
    }
    whatsappWindow.opener = null;
    void updateWhatsAppAction('opened');
  }

  async function generateDraft() {
    if (!target || busy) return;
    setBusy('ai');
    setError(null);
    try {
      const response = await fetch(`/api/admin/prospects/${target.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, generateDraft: true, preview: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر توليد المسودة.');
      setSubject(payload.draft?.subject || subject);
      setBody(payload.draft?.body || '');
      setNotice('تم توليد المسودة، راجعها قبل الإرسال.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذر توليد المسودة.');
    } finally {
      setBusy(null);
    }
  }

  async function sendSingle() {
    if (!target || !body.trim() || busy) return;
    setBusy('single');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/prospects/${target.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'فشل إرسال البريد.');
      setTarget(null);
      setNotice(`تم إرسال البريد إلى ${target.email}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل إرسال البريد.');
    } finally {
      setBusy(null);
    }
  }

  async function sendBatch(ids: string[]) {
    if (ids.length === 0 || busy) return;
    setBusy('batch');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/prospects/batch-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => ({})) as Partial<BatchResult> & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'فشل الإرسال الجماعي.');
      setSelectedIds([]);
      setNotice(`تم إرسال ${payload.sent ?? 0}، وفشل ${payload.failed ?? 0}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل الإرسال الجماعي.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    const ids = selectedIds;
    if (ids.length === 0 || busy !== null || bulkDeleteBusy) return;
    if (ids.length > 200) {
      setError('يمكن حذف 200 عيادة كحد أقصى في كل دفعة.');
      return;
    }

    setBulkDeleteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/prospects/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json().catch(() => null) as { deleted?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'تعذر حذف العيادات المحددة.');
      if (!payload || typeof payload.deleted !== 'number' || !Number.isInteger(payload.deleted) || payload.deleted < 0) {
        throw new Error('استجابة الحذف غير صالحة.');
      }

      setSelectedIds([]);
      setBulkDeleteOpen(false);
      setNotice(`تم حذف ${payload.deleted} عيادة.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذر حذف العيادات المحددة.');
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-amber-400" />
          تحديد الكل
        </label>
        {selectedIds.length > 0 && (
          <>
            <span className="text-sm text-slate-300" aria-live="polite">تم تحديد {selectedIds.length} عيادة</span>
            <button type="button" onClick={() => setSelectedIds([])} disabled={busy !== null || bulkDeleteBusy} className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
              إلغاء التحديد
            </button>
            <button type="button" onClick={() => { setError(null); setBulkDeleteOpen(true); }} disabled={busy !== null || bulkDeleteBusy} className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/10 disabled:opacity-50">
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              حذف المحدد ({selectedIds.length})
            </button>
            <button type="button" onClick={() => void sendBatch(selectedIds)} disabled={busy !== null || bulkDeleteBusy} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50">
              {busy === 'batch' && <Loader2 className="h-4 w-4 animate-spin" />}
              إرسال المحدد ({selectedIds.length})
            </button>
          </>
        )}
        <button type="button" onClick={() => void sendBatch(newProspectIds.slice(0, 50))} disabled={busy !== null || bulkDeleteBusy || newProspectIds.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">
          <Send className="h-4 w-4" />
          إرسال لكل الجدد ({Math.min(newProspectIds.length, 50)})
        </button>
        {notice && <span role="status" className="text-sm text-emerald-300">{notice}</span>}
        {error && !bulkDeleteOpen && <span role="alert" className="text-sm text-red-300">{error}</span>}
      </div>

      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[980px] text-right text-sm">
          <thead className="bg-slate-950/60 text-xs text-slate-400">
            <tr>
              <th scope="col" className="w-10 px-2 py-3"><span className="sr-only">تحديد</span></th>
              <th scope="col" className="px-2 py-3 font-medium">الاسم</th>
              <th scope="col" className="px-2 py-3 font-medium">المدينة</th>
              <th scope="col" className="px-2 py-3 font-medium">الهاتف</th>
              <th scope="col" className="px-2 py-3 font-medium">البريد</th>
              <th scope="col" className="px-2 py-3 font-medium">الحالة</th>
              <th scope="col" className="px-2 py-3 font-medium">التاريخ</th>
              <th scope="col" className="w-32 whitespace-nowrap px-2 py-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {prospects.map((prospect) => {
              const blocked = !prospect.email || prospect.status === 'converted' || prospect.status === 'rejected';
              const whatsappCount = whatsappSendCount(prospect.metadata);
              return (
                <tr key={prospect.id} className="text-slate-200">
                  <td className="px-2 py-3"><input type="checkbox" checked={selectedIds.includes(prospect.id)} onChange={() => toggleSelected(prospect.id)} className="h-4 w-4 accent-amber-400" aria-label={`تحديد ${prospect.clinic_name}`} /></td>
                  <td className="px-2 py-3 font-medium text-white">
                    <span className="block max-w-[200px] truncate" title={prospect.clinic_name}>
                      {prospect.clinic_name}
                    </span>
                  </td>
                  <td className="max-w-[120px] truncate px-2 py-3" title={prospect.country}>{prospect.city}</td>
                  <td className="px-2 py-3" dir="ltr">{prospect.phone || '—'}</td>
                  <td className="max-w-[180px] px-2 py-3" dir="ltr">
                    <span className="block max-w-[180px] truncate" title={prospect.email ?? undefined}>
                      {prospect.email || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <span className="whitespace-nowrap rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs leading-4">{statusLabels[prospect.status] ?? prospect.status}</span>
                    {whatsappCount > 0 && <span className="mr-1 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs leading-4 text-emerald-300">واتساب ✓</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-slate-400" title={prospect.created_at_label}>
                    {shortDate(prospect.created_at, prospect.created_at_label)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openWhatsApp(prospect)}
                        disabled={!prospect.phone?.trim()}
                        title={!prospect.phone?.trim() ? 'لا يوجد رقم' : 'واتساب'}
                        aria-label={`واتساب ${prospect.clinic_name}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 p-1.5 text-emerald-200 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MessageCircle aria-hidden="true" className="h-4 w-4" />
                        <span className="text-[10px] text-emerald-300/70">{whatsappCount}</span>
                      </button>
                      {!blocked && (
                        <button
                          type="button"
                          onClick={() => openEmail(prospect)}
                          title="إرسال بريد"
                          aria-label={`إرسال بريد إلى ${prospect.clinic_name}`}
                          className="inline-flex items-center justify-center rounded-lg border border-cyan-400/30 p-1.5 text-cyan-200 hover:bg-cyan-400/10"
                        >
                          <Mail aria-hidden="true" className="h-4 w-4" />
                        </button>
                      )}
                      {prospect.status !== 'archived' && (
                        <form action={archiveProspect}>
                          <input type="hidden" name="id" value={prospect.id} />
                          <button
                            type="submit"
                            title="أرشفة"
                            aria-label={`أرشفة ${prospect.clinic_name}`}
                            className="inline-flex items-center justify-center rounded-lg border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10"
                          >
                            <Archive aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" aria-label="إغلاق تأكيد الحذف" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteBusy} className="absolute inset-0 cursor-default" />
          <section role="dialog" aria-modal="true" aria-labelledby="prospect-bulk-delete-title" className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="prospect-bulk-delete-title" className="text-lg font-bold text-white">تأكيد حذف العيادات</h2>
            <p className="mt-3 text-sm text-slate-200">هل أنت متأكد من حذف {selectedIds.length} عيادة؟</p>
            <p className="mt-1 text-sm text-red-300">لا يمكن التراجع عن هذا الإجراء.</p>
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteBusy} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
              <button type="button" onClick={() => void deleteSelected()} disabled={bulkDeleteBusy || busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50">
                {bulkDeleteBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                حذف نهائي
              </button>
            </div>
          </section>
        </div>
      )}

      {whatsappTarget && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" aria-label="إغلاق WhatsApp" onClick={closeWhatsApp} className="absolute inset-0 cursor-default" />
          <section role="dialog" aria-modal="true" aria-labelledby="prospect-whatsapp-title" className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="prospect-whatsapp-title" className="text-lg font-bold text-white">
              {whatsappStep === 'compose' ? 'التواصل عبر WhatsApp' : 'تسجيل نتيجة التواصل'}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{whatsappTarget.clinic_name}</p>
            <p className="mt-1 text-sm text-slate-400" dir="ltr">
              {normalizedProspectPhone(whatsappTarget)
                ? `+${normalizedProspectPhone(whatsappTarget)}`
                : whatsappTarget.phone}
            </p>
            {whatsappStep === 'compose' ? (
              <>
                <label className="mt-5 block space-y-2 text-sm text-slate-300">
                  <span>نص الرسالة</span>
                  <textarea
                    value={whatsappMessage}
                    onChange={(event) => setWhatsappMessage(event.target.value)}
                    rows={12}
                    maxLength={4000}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-emerald-400"
                  />
                </label>
                {whatsappError && <p role="alert" className="mt-3 text-sm text-red-300">{whatsappError}</p>}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={closeWhatsApp} disabled={whatsappBusy} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
                  <button
                    type="button"
                    onClick={openWhatsAppChat}
                    disabled={whatsappBusy || !normalizedProspectPhone(whatsappTarget) || !whatsappMessage.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {whatsappBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    فتح WhatsApp
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-emerald-200">تم فتح WhatsApp وتسجيل محاولة التواصل. حدّث النتيجة بعد المحادثة.</p>
                {whatsappError && <p role="alert" className="mt-3 text-sm text-red-300">{whatsappError}</p>}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={closeWhatsApp} disabled={whatsappBusy} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إغلاق</button>
                  <button type="button" onClick={() => void updateWhatsAppAction('no_reply')} disabled={whatsappBusy} className="rounded-xl border border-amber-400/40 px-4 py-2.5 text-sm text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">لم يرد</button>
                  <button type="button" onClick={() => void updateWhatsAppAction('replied')} disabled={whatsappBusy} className="rounded-xl border border-emerald-400/40 px-4 py-2.5 text-sm text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50">تم الرد</button>
                  <button type="button" onClick={() => void updateWhatsAppAction('rejected')} disabled={whatsappBusy} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50">غير مهتم</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <button type="button" aria-label="إغلاق إرسال البريد" onClick={closeEmail} className="absolute inset-0 cursor-default" />
          <section role="dialog" aria-modal="true" aria-labelledby="prospect-email-title" className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 id="prospect-email-title" className="text-lg font-bold text-white">إرسال بريد إلى {target.clinic_name}</h2>
            <p className="mt-1 text-sm text-slate-400" dir="ltr">{target.email}</p>
            <div className="mt-5 space-y-4">
              <label className="block space-y-2 text-sm text-slate-300"><span>الموضوع</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={300} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label>
              <label className="block space-y-2 text-sm text-slate-300"><span>نص الرسالة</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} maxLength={20_000} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label>
              {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}
              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => void generateDraft()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"><Sparkles className="h-4 w-4" /> توليد بالـ AI</button>
                <button type="button" onClick={closeEmail} disabled={busy !== null} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
                <button type="button" onClick={() => void sendSingle()} disabled={busy !== null || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{busy === 'single' && <Loader2 className="h-4 w-4 animate-spin" />} إرسال البريد</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
