'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import ExpenseDialog from '@/components/dashboard/ExpenseDialog';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';

type Expense = {
  id: string;
  expense_number: string;
  spent_at: string;
  vendor: string | null;
  notes: string | null;
  category_name: string | null;
  amount: number;
  status: 'recorded' | 'voided' | string;
  void_reason?: string | null;
};

type Category = { id: string; name: string; is_active?: boolean };
type ExpenseStatus = 'all' | 'recorded' | 'voided';

const PAGE_SIZE = 50;
const inputClass = 'rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500';
const formatMoney = (amount: number) => new Intl.NumberFormat('ar-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(amount);
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ar-IL', { dateStyle: 'medium' }).format(date);
};

export default function ExpensesPage() {
  const { clinicId, role, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ExpenseStatus>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const canVoid = role === 'owner';

  useEffect(() => {
    if (!clinicId || clinicLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch(`/api/clinic/accounting/expense-categories?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        const payload = await response.json().catch(() => null);
        if (response.ok && !cancelled) setCategories(Array.isArray(payload?.data) ? payload.data : []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => { cancelled = true; };
  }, [authHeaders, clinicId, clinicLoading]);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (!clinicId) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ clinic_id: clinicId, limit: String(PAGE_SIZE), offset: String(offset) });
      if (from) params.set('from', from);
      if (to) params.set('to', `${to}T23:59:59.999Z`);
      if (categoryId) params.set('category_id', categoryId);
      if (status !== 'all') params.set('status', status);
      const headers = await authHeaders();
      const response = await fetch(`/api/clinic/accounting/expenses?${params.toString()}`, { headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'تعذر تحميل المصروفات. تحقق من صلاحية الوصول المالي.');
      const rows = Array.isArray(payload?.data) ? payload.data as Expense[] : [];
      setExpenses((current) => append ? [...current, ...rows] : rows);
      setHasMore(Boolean(payload?.pagination?.hasMore));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'تعذر تحميل المصروفات.');
      if (!append) setExpenses([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [authHeaders, categoryId, clinicId, from, status, to]);

  useEffect(() => {
    if (clinicLoading) return;
    if (!clinicId) {
      setLoading(false);
      setError(clinicError || 'اختر عيادة لعرض المصروفات.');
      return;
    }
    void loadPage(0, false);
  }, [clinicError, clinicId, clinicLoading, loadPage, refreshKey]);

  const confirmVoid = async () => {
    if (!clinicId || !voidTarget || !voidReason.trim()) {
      setVoidError('سبب الإلغاء مطلوب.');
      return;
    }
    setVoidSubmitting(true);
    setVoidError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/clinic/accounting/expenses/${encodeURIComponent(voidTarget.id)}/void?clinic_id=${encodeURIComponent(clinicId)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'تعذر إلغاء المصروف.');
      setVoidTarget(null);
      setVoidReason('');
      setRefreshKey((key) => key + 1);
    } catch (caughtError) {
      setVoidError(caughtError instanceof Error ? caughtError.message : 'تعذر إلغاء المصروف.');
    } finally {
      setVoidSubmitting(false);
    }
  };

  return (
    <>
      <DashboardSection
        title="المصروفات"
        subtitle="سجلات المصروفات التشغيلية للعيادة. تُلغى السجلات الخاطئة مع الاحتفاظ بأثرها المحاسبي."
        action={
          <button type="button" onClick={() => setExpenseDialogOpen(true)} disabled={!clinicId} className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
            + إضافة مصروف
          </button>
        }
      >
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">من تاريخ<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">إلى تاريخ<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">الفئة
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
              <option value="">كل الفئات</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">الحالة
            <select value={status} onChange={(event) => setStatus(event.target.value as ExpenseStatus)} className={inputClass}>
              <option value="all">كل الحالات</option>
              <option value="recorded">مسجّل</option>
              <option value="voided">ملغى</option>
            </select>
          </label>
        </div>

        {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : expenses.length === 0 ? (
          <EmptyState title="لا توجد مصروفات" description="غيّر الفلاتر أو سجّل مصروفاً جديداً لعرضه هنا." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="bg-slate-950/80 text-xs text-slate-400">
                <tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">الوصف</th><th className="px-4 py-3">الفئة</th><th className="px-4 py-3">المبلغ</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">الإجراء</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="text-slate-200">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(expense.spent_at)}</td>
                    <td className="px-4 py-3"><span className="block font-medium">{expense.notes || expense.vendor || '—'}</span><span className="text-xs text-slate-500">{expense.expense_number}</span></td>
                    <td className="px-4 py-3">{expense.category_name || 'غير مصنّف'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatMoney(Number(expense.amount) || 0)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${expense.status === 'voided' ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{expense.status === 'voided' ? 'ملغى' : 'مسجّل'}</span></td>
                    <td className="px-4 py-3">{canVoid && expense.status !== 'voided' ? <button type="button" onClick={() => { setVoidTarget(expense); setVoidReason(''); setVoidError(null); }} className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-300 transition hover:bg-rose-500/10">إلغاء</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore ? <div className="mt-5 text-center"><button type="button" onClick={() => void loadPage(expenses.length, true)} disabled={loadingMore} className="rounded-full border border-slate-700 px-5 py-2 text-sm text-slate-200 transition hover:border-cyan-500 disabled:opacity-50">{loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}</button></div> : null}
      </DashboardSection>

      {clinicId ? <ExpenseDialog clinicId={clinicId} authHeaders={authHeaders} open={expenseDialogOpen} onClose={() => setExpenseDialogOpen(false)} onSaved={() => setRefreshKey((key) => key + 1)} /> : null}

      {voidTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="void-expense-title">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between"><h2 id="void-expense-title" className="text-lg font-semibold text-white">تأكيد إلغاء المصروف</h2><button type="button" disabled={voidSubmitting} onClick={() => setVoidTarget(null)} aria-label="إغلاق" className="text-slate-400 hover:text-white">×</button></div>
            <p className="text-sm text-slate-300">سيُسجّل إلغاء المصروف {voidTarget.expense_number} مع الاحتفاظ بأثره المحاسبي. أدخل سبب الإلغاء.</p>
            <label className="block space-y-1 text-xs text-slate-400">سبب الإلغاء *<textarea autoFocus value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} rows={3} className={`${inputClass} w-full`} /></label>
            {voidError ? <p role="alert" className="text-sm text-rose-300">{voidError}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" disabled={voidSubmitting} onClick={() => setVoidTarget(null)} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300">إلغاء العملية</button><button type="button" disabled={voidSubmitting || !voidReason.trim()} onClick={() => void confirmVoid()} className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{voidSubmitting ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
