'use client';

import { useEffect, useState } from 'react';

/**
 * G — "+ مصروف" dialog (financial intelligence page).
 * Uses the EXISTING accounting APIs (no new backend): GET expense-categories
 * for the dropdown (with inline "new category" fallback when none exist yet)
 * and POST expenses to record the immutable movement. Global by default —
 * every clinic, no hard-coding.
 */

type ExpenseCategory = { id: string; name: string; active: boolean };

const EXPENSE_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'نقداً' },
  { value: 'card', label: 'بطاقة' },
  { value: 'bank_transfer', label: 'حوالة بنكية' },
  { value: 'other', label: 'أخرى' },
];

type Props = {
  clinicId: string;
  authHeaders: () => Promise<Record<string, string>>;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function ExpenseDialog({ clinicId, authHeaders, open, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clinicId) return;
    let isMounted = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/clinic/accounting/expense-categories?clinic_id=${encodeURIComponent(clinicId)}`,
          { headers: await authHeaders() }
        );
        const payload = await response.json();
        if (isMounted && response.ok) {
          const list = (payload?.data ?? []) as ExpenseCategory[];
          setCategories(list.filter((item) => item.active !== false));
        }
      } catch {
        // categories stay empty — the form still works with a new inline category
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [open, clinicId, authHeaders]);

  if (!open) return null;

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">تسجيل مصروف</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-white" aria-label="إغلاق">
            ✕
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">المبلغ *</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0.00" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">طريقة الدفع</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {EXPENSE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">التاريخ</span>
            <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={inputClass} />
          </label>
        </div>
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
          <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputClass} placeholder="مثال: مخبر التركيبات" maxLength={120} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">ملاحظات</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="اختياري" maxLength={500} />
        </label>

        {message ? (
          <p className={`rounded-lg px-3 py-2 text-xs ${message.startsWith('تم') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{message}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500">
            إلغاء
          </button>
          <button
            type="button"
            onClick={saveExpense}
            disabled={saving || !amount.trim() || Number(amount) <= 0}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
          </button>
        </div>
      </div>
    </div>
  );

  async function saveExpense() {
    if (!clinicId || saving) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/clinic/accounting/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          clinic_id: clinicId,
          category_id: categoryId || null,
          amount: parsedAmount,
          method,
          spent_at: spentAt || null,
          vendor: vendor.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const raw = await response.text();
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        // Non-JSON body (edge error page) — handled by the !response.ok branch.
      }
      if (!response.ok) {
        const apiMessage = (payload as { error?: string } | null)?.error;
        setMessage(apiMessage ? `تعذر الحفظ: ${apiMessage}` : `تعذر حفظ المصروف (${response.status})`);
        return;
      }
      setMessage('تم حفظ المصروف بنجاح');
      setAmount('');
      setVendor('');
      setNotes('');
      onSaved();
      onClose();
    } catch {
      setMessage('تعذر الاتصال بالخدمة — تحقق من الشبكة');
    } finally {
      setSaving(false);
    }
  }
}
