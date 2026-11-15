'use client';

import { useEffect, useMemo, useState } from 'react';

type ExpenseCategory = { id: string; name: string; is_active?: boolean; active?: boolean };

type ExpenseLike = {
  id?: string;
  amount?: number | string | null;
  spent_at?: string | null;
  method?: string | null;
  notes?: string | null;
  vendor?: string | null;
  category_id?: string | null;
  attachment_url?: string | null;
};

type Props = {
  expense: ExpenseLike | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved?: () => void;
  clinicId: string;
  authHeaders: () => Promise<Record<string, string>>;
};

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500';

export default function EditExpenseDialog({ expense, open, onOpenChange, onSaved, clinicId, authHeaders }: Props) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [notes, setNotes] = useState('');
  const [vendor, setVendor] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const expenseId = expense?.id ?? '';
  const amountText = useMemo(() => {
    const amount = Number(expense?.amount ?? 0);
    return Number.isFinite(amount) ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  }, [expense?.amount]);

  useEffect(() => {
    if (!open || !clinicId) return;
    let mounted = true;

    const loadCategories = async () => {
      try {
        const response = await fetch(`/api/clinic/accounting/expense-categories?clinic_id=${encodeURIComponent(clinicId)}`, {
          headers: await authHeaders(),
        });
        const payload = await response.json().catch(() => null);
        if (!mounted) return;
        if (!response.ok) {
          setCategories([]);
          return;
        }
        const list = ((payload as { data?: ExpenseCategory[] } | null)?.data ?? []) as ExpenseCategory[];
        setCategories(list.filter((item) => (item.is_active ?? item.active ?? true) !== false));
      } catch {
        setCategories([]);
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, [open, clinicId, authHeaders]);

  useEffect(() => {
    if (!open || !expense) return;
    setNotes(expense.notes ?? '');
    setVendor(expense.vendor ?? '');
    setCategoryId(expense.category_id ?? '');
    setSelectedFile(null);
    setMessage(null);
    setPreviewUrl(null);
    setAttachmentLoading(false);

    const currentExpenseId = expense.id;
    if (!expense.attachment_url || !currentExpenseId) return;
    let mounted = true;
    setAttachmentLoading(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/clinic/accounting/expenses/${encodeURIComponent(currentExpenseId)}/attachment?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers: await authHeaders() }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? 'تعذر تحميل معاينة المرفق.');
        const signedUrl = (payload as { data?: { signedUrl?: string | null } } | null)?.data?.signedUrl ?? null;
        if (!signedUrl) throw new Error('لا يوجد رابط صالح للمرفق.');
        if (mounted) setPreviewUrl(signedUrl);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : 'تعذر تحميل معاينة المرفق.');
      } finally {
        if (mounted) setAttachmentLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [open, expense, clinicId, authHeaders]);

  if (!open || !expense) return null;

  const updateExpense = async () => {
    if (!expenseId || !clinicId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/clinic/accounting/expenses/${encodeURIComponent(expenseId)}?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          notes: notes.trim() || null,
          vendor: vendor.trim() || null,
          category_id: categoryId || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const apiMessage = (payload as { error?: string } | null)?.error;
        setMessage(apiMessage ? `تعذر تحديث المصروف: ${apiMessage}` : 'تعذر تحديث المصروف');
        return;
      }

      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadResponse = await fetch(`/api/clinic/accounting/expenses/${encodeURIComponent(expenseId)}/attachment?clinic_id=${encodeURIComponent(clinicId)}`, {
          method: 'POST',
          headers: await authHeaders(),
          body: formData,
        });
        const uploadPayload = await uploadResponse.json().catch(() => null);
        if (!uploadResponse.ok) {
          const uploadError = (uploadPayload as { error?: string } | null)?.error;
          setMessage(`تم حفظ التعديلات، لكن تعذر رفع المرفق${uploadError ? `: ${uploadError}` : ''}`);
          onSaved?.();
          return;
        }
      }

      setMessage('تم حفظ التعديلات بنجاح');
      onSaved?.();
      onOpenChange(false);
    } catch {
      setMessage('تعذر الاتصال بالخدمة');
    } finally {
      setSaving(false);
    }
  };

  const removeAttachment = async () => {
    if (!expenseId || !clinicId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/clinic/accounting/expenses/${encodeURIComponent(expenseId)}/attachment?action=delete&clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const apiMessage = (payload as { error?: string } | null)?.error;
        setMessage(apiMessage ? `تعذر حذف المرفق: ${apiMessage}` : 'تعذر حذف المرفق');
        return;
      }
      setPreviewUrl(null);
      onSaved?.();
      setMessage('تم حذف المرفق');
    } catch {
      setMessage('تعذر حذف المرفق');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async () => {
    if (!expenseId || !clinicId) return;
    try {
      const response = await fetch(
        `/api/clinic/accounting/expenses/${encodeURIComponent(expenseId)}/attachment?clinic_id=${encodeURIComponent(clinicId)}&download=true`,
        { headers: await authHeaders() }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? 'تعذر تنزيل المرفق.');
      }
      const signedUrl = (payload as { data?: { signedUrl?: string | null } } | null)?.data?.signedUrl;
      if (!signedUrl) throw new Error('لا يوجد رابط صالح لتنزيل المرفق.');
      window.location.assign(signedUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تنزيل المرفق.');
    }
  };

  const attachmentName = expense.attachment_url?.split('/').pop()?.replace(/^\d+-/, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">تعديل المصروف</h3>
          <button type="button" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-white" aria-label="إغلاق">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">المبلغ</span>
            <input value={amountText} readOnly className={`${inputClass} cursor-not-allowed bg-slate-950/60`} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">التاريخ</span>
            <input value={expense.spent_at ? String(expense.spent_at).slice(0, 10) : ''} readOnly className={`${inputClass} cursor-not-allowed bg-slate-950/60`} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">طريقة الدفع</span>
          <input value={expense.method ?? ''} readOnly className={`${inputClass} cursor-not-allowed bg-slate-950/60`} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">الفئة</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">غير مصنّف</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">المورّد / الجهة</span>
          <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputClass} placeholder="اسم المورد" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">ملاحظات</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="ملاحظات إضافية" />
        </label>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">المرفق</span>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950">
                تغيير
                <input type="file" accept=".pdf,image/jpeg,image/png" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
              </label>
              {previewUrl ? (
                <button type="button" onClick={removeAttachment} className="rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-[11px] text-rose-200">
                  حذف
                </button>
              ) : null}
            </div>
          </div>

          {previewUrl ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300" title={attachmentName}>
                  {attachmentName || 'الفاتورة المرفقة'}
                </span>
                <div className="flex gap-2">
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-cyan-500/40 px-2.5 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-500/10"
                  >
                    معاينة
                  </a>
                  <button
                    type="button"
                    onClick={() => void downloadAttachment()}
                    className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
                  >
                    تنزيل
                  </button>
                </div>
              </div>
              {previewUrl.toLowerCase().endsWith('.pdf') || previewUrl.includes('pdf') ? (
                <iframe src={previewUrl} className="h-52 w-full rounded-lg border border-slate-700 bg-slate-900" title="Expense attachment" />
              ) : (
                <img src={previewUrl} alt="Expense attachment" className="max-h-52 w-full rounded-lg border border-slate-700 object-contain" />
              )}
            </div>
          ) : attachmentLoading ? (
            <p className="text-[11px] text-slate-500">جارٍ تحميل المرفق...</p>
          ) : expense.attachment_url ? (
            <p className="text-[11px] text-rose-300">تعذر تحميل معاينة المرفق. حاول إغلاق النافذة وإعادة فتحها.</p>
          ) : (
            <p className="text-[11px] text-slate-500">لا توجد فاتورة مرفقة.</p>
          )}
          {selectedFile ? <p className="mt-2 text-[11px] text-cyan-300">ملف جديد: {selectedFile.name}</p> : null}
        </div>

        <p className="text-[11px] text-slate-400">لتصحيح المبلغ/التاريخ/الطريقة: ألغِ المصروف ثم سجّل من جديد.</p>

        {message ? <p className={`rounded-lg px-3 py-2 text-xs ${message.includes('نجاح') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{message}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300">إلغاء</button>
          <button type="button" onClick={updateExpense} disabled={saving} className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>
    </div>
  );
}
