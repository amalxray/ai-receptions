'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardSection from '@/components/dashboard/DashboardSection';
import EmptyState from '@/components/dashboard/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import { useClinicContext } from '@/lib/useClinicContext';

type InvoiceRow = {
  id: string;
  patient_id: string;
  patient_name: string | null;
  invoice_number: string;
  total: number;
  status: 'paid' | 'issued' | 'partially_paid' | 'voided' | string;
  issued_at: string;
};

type PaymentRow = {
  id: string;
  receipt_number: string | null;
  patient_name: string | null;
  invoice_number: string | null;
  amount: number;
  method: string;
  created_at: string;
  status: 'recorded' | 'voided' | string;
};

type RevenueTab = 'invoices' | 'payments';
type InvoiceFilter = 'all' | 'paid' | 'unpaid' | 'voided';
type VoidTarget = { kind: 'invoice' | 'payment'; id: string; label: string };

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('ar-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(amount);

const formatDate = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ar-IL', { dateStyle: 'medium' }).format(date);
};

const invoiceStatusLabel = (status: InvoiceRow['status']) => {
  if (status === 'paid') return 'مدفوعة';
  if (status === 'voided') return 'ملغاة';
  return 'غير مدفوعة';
};

const paymentMethodLabel = (method: string) => {
  const labels: Record<string, string> = {
    cash: 'نقداً',
    card: 'بطاقة',
    bank_transfer: 'تحويل بنكي',
    insurance: 'تأمين',
    other: 'أخرى',
  };
  return labels[method] ?? method;
};

function responseRows<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data as T[] : [];
}

export default function RevenuesPage() {
  const { clinicId, clinicSlug, role, authHeaders, loading: clinicLoading, error: clinicError } = useClinicContext();
  const [activeTab, setActiveTab] = useState<RevenueTab>('invoices');
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const canVoid = role === 'owner';

  useEffect(() => {
    if (clinicLoading) return;
    if (!clinicId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const headers = await authHeaders();
        const endpoint = activeTab === 'invoices'
          ? `/api/clinic/accounting/invoices?clinic_id=${encodeURIComponent(clinicId)}&limit=100${invoiceFilter === 'all' ? '' : `&status=${invoiceFilter}`}`
          : `/api/clinic/accounting/payments?clinic_id=${encodeURIComponent(clinicId)}&limit=100`;
        const response = await fetch(endpoint, { headers });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = (payload as { error?: string } | null)?.error;
          throw new Error(message || 'تعذر تحميل بيانات الإيرادات');
        }
        if (cancelled) return;
        if (activeTab === 'invoices') setInvoices(responseRows<InvoiceRow>(payload));
        else setPayments(responseRows<PaymentRow>(payload));
      } catch (caughtError) {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ أثناء تحميل البيانات');
        if (activeTab === 'invoices') setInvoices([]);
        else setPayments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, authHeaders, clinicId, clinicLoading, invoiceFilter, refreshKey]);

  const openVoidDialog = (target: VoidTarget) => {
    setVoidTarget(target);
    setVoidReason('');
    setVoidError(null);
  };

  const closeVoidDialog = () => {
    if (voidSubmitting) return;
    setVoidTarget(null);
    setVoidReason('');
    setVoidError(null);
  };

  const confirmVoid = async () => {
    if (!clinicId || !voidTarget || !voidReason.trim()) {
      setVoidError('سبب الإلغاء مطلوب.');
      return;
    }
    setVoidSubmitting(true);
    setVoidError(null);
    try {
      const headers = await authHeaders();
      const resource = voidTarget.kind === 'invoice' ? 'invoices' : 'payments';
      const response = await fetch(
        `/api/clinic/accounting/${resource}/${encodeURIComponent(voidTarget.id)}/void?clinic_id=${encodeURIComponent(clinicId)}`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: voidReason.trim() }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = (payload as { error?: string } | null)?.error;
        throw new Error(message || 'تعذر إلغاء السجل. تحقق من صلاحياتك وحالة السجل.');
      }
      setVoidTarget(null);
      setVoidReason('');
      setRefreshKey((current) => current + 1);
    } catch (caughtError) {
      setVoidError(caughtError instanceof Error ? caughtError.message : 'حدث خطأ أثناء الإلغاء.');
    } finally {
      setVoidSubmitting(false);
    }
  };

  const patientHref = (patientId: string) =>
    `/dashboard/${encodeURIComponent(clinicSlug || 'clinic')}/patients/${encodeURIComponent(patientId)}`;

  return (
    <DashboardSection
      title="الإيرادات"
      subtitle="استعرض الفواتير الصادرة والمدفوعات المسجلة في العيادة."
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="بيانات الإيرادات">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'invoices'}
            onClick={() => setActiveTab('invoices')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'invoices' ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            الفواتير
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'payments'}
            onClick={() => setActiveTab('payments')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'payments' ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            المدفوعات
          </button>
        </div>

        {activeTab === 'invoices' ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            الحالة
            <select
              value={invoiceFilter}
              onChange={(event) => setInvoiceFilter(event.target.value as InvoiceFilter)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              <option value="all">الكل</option>
              <option value="paid">مدفوعة</option>
              <option value="unpaid">غير مدفوعة</option>
              <option value="voided">ملغاة</option>
            </select>
          </label>
        ) : null}
      </div>

      {clinicError || error ? (
        <EmptyState title="تعذر تحميل بيانات الإيرادات" description={clinicError ?? error ?? ''} />
      ) : loading ? (
        <div className="space-y-3" aria-label="جارٍ تحميل البيانات">
          {[0, 1, 2].map((row) => <Skeleton key={row} className="h-14" />)}
        </div>
      ) : activeTab === 'invoices' ? (
        invoices.length === 0 ? (
          <EmptyState title="لا توجد فواتير" description="لا توجد فواتير تطابق الحالة المختارة." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-950/70 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3">رقم الفاتورة</th>
                  <th className="px-4 py-3">المريض</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">تاريخ الإصدار</th>
                  <th className="px-4 py-3">الملف</th>
                  <th className="px-4 py-3">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                    <td className="px-4 py-3">{invoice.patient_name || '—'}</td>
                    <td className="px-4 py-3">{formatMoney(Number(invoice.total || 0))}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${invoice.status === 'paid' ? 'bg-emerald-400/10 text-emerald-200' : invoice.status === 'voided' ? 'bg-slate-700 text-slate-300' : 'bg-amber-400/10 text-amber-200'}`}>
                        {invoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(invoice.issued_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={patientHref(invoice.patient_id)} className="font-semibold text-cyan-200 hover:underline">
                        عرض
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {canVoid && invoice.status !== 'voided' ? (
                        <button
                          type="button"
                          onClick={() => openVoidDialog({ kind: 'invoice', id: invoice.id, label: invoice.invoice_number })}
                          className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                        >
                          إلغاء
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : payments.length === 0 ? (
        <EmptyState title="لا توجد مدفوعات" description="لم تُسجّل مدفوعات لعرضها حالياً." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[1000px] text-right text-sm">
            <thead className="bg-slate-950/70 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3">رقم الإيصال</th>
                <th className="px-4 py-3">المريض</th>
                <th className="px-4 py-3">رقم الفاتورة</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">طريقة الدفع</th>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-medium">{payment.receipt_number || '—'}</td>
                  <td className="px-4 py-3">{payment.patient_name || '—'}</td>
                  <td className="px-4 py-3">{payment.invoice_number || '—'}</td>
                  <td className="px-4 py-3">{formatMoney(Number(payment.amount || 0))}</td>
                  <td className="px-4 py-3">{paymentMethodLabel(payment.method)}</td>
                  <td className="px-4 py-3">{formatDate(payment.created_at)}</td>
                  <td className="px-4 py-3">{payment.status === 'voided' ? 'ملغاة' : 'مسجلة'}</td>
                  <td className="px-4 py-3">
                    {canVoid && payment.status !== 'voided' ? (
                      <button
                        type="button"
                        onClick={() => openVoidDialog({ kind: 'payment', id: payment.id, label: payment.receipt_number || payment.invoice_number || payment.id })}
                        className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                      >
                        إلغاء
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {voidTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-dialog-title"
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <h2 id="void-dialog-title" className="text-xl font-bold text-white">تأكيد الإلغاء</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {voidTarget.kind === 'invoice'
                ? 'سيتم إلغاء هذه الفاتورة نهائياً من الحسابات. أدخل سبب الإلغاء.'
                : 'سيتم إلغاء هذه الدفعة نهائياً من الحسابات. أدخل سبب الإلغاء.'}
            </p>
            <p className="mt-2 text-xs text-slate-400">السجل: {voidTarget.label}</p>
            <label htmlFor="void-reason" className="mt-5 block text-sm font-medium text-slate-200">سبب الإلغاء</label>
            <textarea
              id="void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              rows={3}
              required
              maxLength={500}
              disabled={voidSubmitting}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-60"
              placeholder="اكتب سبب الإلغاء"
            />
            {voidError ? <p role="alert" className="mt-3 text-sm text-rose-300">{voidError}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeVoidDialog}
                disabled={voidSubmitting}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                إلغاء العملية
              </button>
              <button
                type="button"
                onClick={() => void confirmVoid()}
                disabled={voidSubmitting || !voidReason.trim()}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {voidSubmitting ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardSection>
  );
}
