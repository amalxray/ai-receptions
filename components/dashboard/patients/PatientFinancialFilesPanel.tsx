'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClinicContext } from '@/lib/useClinicContext';

/**
 * PHASE I — Unified patient financial + medical file panel.
 *
 * Reusable panel inside the patient page when a patient is selected.
 * Reads only; all mutations go through the authoritative RPCs
 * (issue_invoice / record_payment) and the medical-file upload route.
 */

type InvoiceRow = {
  id: string;
  invoice_number?: string | null;
  patient_id?: string | null;
  total?: number;
  total_amount?: number;
  total_due?: number;
  outstanding_amount?: number;
  invoiced_total?: number;
  paid_total?: number;
  balance_due?: number;
  paid_amount?: number;
  status?: string;
  created_at?: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id?: string | null;
  amount?: number;
  method?: string | null;
  status?: string;
  receipt_number?: string | null;
  created_at?: string | null;
};

type BalanceRow = {
  outstanding_amount?: number;
  invoiced_total?: number;
  paid_total?: number;
  balance_due?: number;
};

type MedicalFileRow = {
  id: string;
  file_type?: string | null;
  original_filename?: string | null;
  size_bytes?: number | null;
  created_at?: string | null;
};

/** One billable row of the clinic catalog. */
type ServiceOption = {
  id: string;
  name: string;
  price?: number | null;
  price_min?: number | null;
  active?: boolean;
};

/** A draft invoice line (all numeric inputs stay strings while editing). */
type InvoiceLineDraft = {
  key: string;
  service_id: string;
  description: string;
  quantity: string;
  unit_price: string;
};

/** Line item as returned by GET /api/clinic/accounting/invoices/[id]. */
type InvoiceItemRow = {
  id: string;
  service_id?: string | null;
  description?: string | null;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};

type Props = {
  patientId: string;
  patientName?: string | null;
};

const METHOD_AR: Record<string, string> = {
  cash: 'نقداً',
  card: 'بطاقة',
  bank_transfer: 'تحويل بنكي',
  insurance: 'تأمين',
  other: 'أخرى',
};

/** Minimal HTML escaping for values interpolated into the print document. */
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Strict UUID v4-shape guard — invoice ids must be UUIDs before hitting the RPC. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PatientFinancialFilesPanel({ patientId, patientName }: Props) {
  const { clinicId, authHeaders, clinicName } = useClinicContext();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [files, setFiles] = useState<MedicalFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Line-item invoicing: the patient must see WHAT they paid for, so an invoice
  // is built from catalog services (service_id + quantity + unit_price) rather
  // than one free-text line.
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [invLines, setInvLines] = useState<InvoiceLineDraft[]>([
    { key: 'l1', service_id: '', description: '', quantity: '1', unit_price: '' },
  ]);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'insurance' | 'other'>('cash');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Void + reissue — the RPC (void_invoice) keeps the invoice numbered with
  // status 'voided'; correction happens by issuing a NEW invoice (reissue).
  const [voidingInvoice, setVoidingInvoice] = useState<InvoiceRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [reissueFrom, setReissueFrom] = useState<string | null>(null);
  const [reissueBusy, setReissueBusy] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Invoice line helpers ─────────────────────────────────────────────────
  const serviceName = (serviceId: string): string =>
    services.find((s) => s.id === serviceId)?.name ?? '';

  const addLine = () => {
    setInvLines((prev) => [
      ...prev,
      { key: `l${Date.now()}`, service_id: '', description: '', quantity: '1', unit_price: '' },
    ]);
  };

  const removeLine = (key: string) => {
    setInvLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) => {
    setInvLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  /** Picking a catalog service prefills its price (editable, e.g. discounts). */
  const pickService = (key: string, serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    const suggested = service?.price ?? service?.price_min ?? null;
    updateLine(key, {
      service_id: serviceId,
      description: service?.name ?? '',
      unit_price: suggested != null && Number(suggested) > 0 ? String(suggested) : '',
    });
  };

  const draftTotal = invLines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unit_price);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0) return sum;
    return sum + quantity * price;
  }, 0);


  const loadAll = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const [invRes, payRes, balRes, fileRes, svcRes] = await Promise.all([
        fetch(`/api/clinic/accounting/invoices?clinic_id=${clinicId}&patient_id=${patientId}`, { headers }),
        fetch(`/api/clinic/accounting/payments?clinic_id=${clinicId}`, { headers }),
        fetch(`/api/clinic/accounting/balances?clinic_id=${clinicId}&patient_id=${patientId}`, { headers }),
        fetch(`/api/clinic/medical-files/list?clinic_id=${clinicId}&patient_id=${patientId}`, { headers }),
        // Catalog for the invoice line items. A failure here must not break the
        // panel: free-text lines stay available as a fallback.
        fetch(`/api/clinic/services?clinic_id=${clinicId}`, { headers }),
      ]);
      const inv = await invRes.json();
      const pay = await payRes.json();
      const bal = await balRes.json();
      const fl = await fileRes.json();
      if (!invRes.ok) throw new Error(inv.error || 'فشل تحميل الفواتير');
      if (!payRes.ok) throw new Error(pay.error || 'فشل تحميل المدفوعات');
      if (!balRes.ok) throw new Error(bal.error || 'فشل تحميل الرصيد');
      if (!fileRes.ok) throw new Error(fl.error || 'فشل تحميل الملفات');
      if (svcRes.ok) {
        const svc = await svcRes.json();
        setServices(
          ((svc.data ?? []) as ServiceOption[]).filter((s) => s.active !== false)
        );
      }

      const invoicesList: InvoiceRow[] = (inv.data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        // invoice_balances exposes `invoice_id` (not `id`) — normalize so every
        // row carries a real UUID. Prevents "invalid input syntax for type uuid"
        // when recording a payment against an invoice.
        id: String(r.invoice_id ?? r.id ?? ''),
      })).filter((r: InvoiceRow) => UUID_RE.test(r.id));
      const invoiceIds = new Set(invoicesList.map((r) => r.id));
      const paymentsList = (pay.data ?? []).filter((p: PaymentRow) => p.invoice_id && invoiceIds.has(p.invoice_id));

      setInvoices(invoicesList);
      setPayments(paymentsList);
      setBalances(bal.data ?? []);
      setFiles(fl.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, authHeaders]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, patientId]);

  const openFile = useCallback(
    async (fileId: string) => {
      if (!clinicId) return;
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/medical-files/${fileId}?clinic_id=${clinicId}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'تعذر فتح الملف');
        window.open(json.data.signed_url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'تعذر فتح الملف');
      }
    },
    [clinicId, authHeaders]
  );

  const issueInvoice = async () => {
    if (!clinicId) return;
    // Only complete lines are billable: a catalog pick OR a free-text label,
    // plus a positive amount. `service_id` links the line to the catalog.
    const items = invLines
      .map((line) => ({
        service_id: line.service_id || null,
        description: line.description.trim() || serviceName(line.service_id),
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
      }))
      .filter(
        (item) =>
          Boolean(item.description) &&
          Number.isFinite(item.quantity) && item.quantity > 0 &&
          Number.isFinite(item.unit_price) && item.unit_price > 0
      );

    if (items.length === 0) {
      setActionError('أضف بنداً واحداً على الأقل: اختر خدمة (أو اكتب وصفاً) وأدخل الكمية والسعر');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          clinic_id: clinicId,
          patient_id: patientId,
          items,
          notes: reissueFrom ? `إعادة إصدار من: ${reissueFrom}` : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل إصدار الفاتورة');
      setActionSuccess(`تم إصدار الفاتورة ${json.data?.invoiceNumber ?? ''} بـ ${items.length} بند`);
      setShowInvoiceForm(false);
      setInvLines([{ key: 'l1', service_id: '', description: '', quantity: '1', unit_price: '' }]);
      setReissueFrom(null);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  /** Opens the void dialog (reason required — matches the RPC contract). */
  const openVoidDialog = (inv: InvoiceRow) => {
    setVoidingInvoice(inv);
    setVoidReason('');
    setVoidError(null);
  };

  /** POSTs to the existing void API (RPC void_invoice + audit log server-side). */
  const confirmVoid = async () => {
    if (!clinicId || !voidingInvoice) return;
    if (!voidReason.trim()) {
      setVoidError('سبب الإلغاء مطلوب');
      return;
    }
    setVoidBusy(true);
    setVoidError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/accounting/invoices/${voidingInvoice.id}/void?clinic_id=${clinicId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل إلغاء الفاتورة');
      setActionSuccess(`تم إلغاء الفاتورة ${voidingInvoice.invoice_number ?? ''} — يمكنك إعادة إصدارها مباشرة.`);
      setVoidingInvoice(null);
      await loadAll();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'حدث خطأ أثناء الإلغاء');
    } finally {
      setVoidBusy(false);
    }
  };

  /** Prefills the invoice form from a voided invoice — amount stays editable. */
  const startReissue = async (inv: InvoiceRow) => {
    if (!clinicId) return;
    setReissueBusy(true);
    setActionError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/accounting/invoices/${inv.id}?clinic_id=${clinicId}`, { headers });
      const json = await res.json();
      const items = Array.isArray(json?.data?.items) ? (json.data.items as InvoiceItemRow[]) : [];
      // Prefill the line builder with the VOIDED invoice's own lines — the
      // correction usually keeps the services and changes amounts.
      const prefilled: InvoiceLineDraft[] = items.length > 0
        ? items.map((item, index) => ({
            key: `r${index}`,
            service_id: item.service_id ?? '',
            description: item.description ?? '',
            quantity: String(Number(item.quantity) || 1),
            unit_price: String(Number(item.unit_price) || ''),
          }))
        : [{ key: 'r0', service_id: '', description: '', quantity: '1', unit_price: String(Number(inv.total_amount ?? inv.total ?? 0) || '') }];
      setReissueFrom(inv.invoice_number ?? null);
      setInvLines(prefilled);
      setShowInvoiceForm(true);
      setActionSuccess(`إعادة إصدار من: ${inv.invoice_number ?? ''} — عدّل البيانات ثم أصدِر الفاتورة الجديدة`);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحضير إعادة الإصدار');
    } finally {
      setReissueBusy(false);
    }
  };

  const recordPayment = async () => {
    if (!clinicId) return;
    const amount = Number(payAmount);
    if (!payInvoiceId || !Number.isFinite(amount) || amount <= 0) {
      setActionError('اختر فاتورة وأدخل مبلغاً صحيحاً');
      return;
    }
    if (!UUID_RE.test(payInvoiceId)) {
      setActionError('معرّف الفاتورة غير صالح — أعد تحميل الصفحة وحاول مجدداً');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/clinic/accounting/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          clinic_id: clinicId,
          invoice_id: payInvoiceId,
          amount,
          method: payMethod,
          payment_date: payDate ? new Date(`${payDate}T12:00:00`).toISOString() : null,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل تسجيل الدفعة');
      setActionSuccess(`تم تسجيل الدفعة ${json.data?.receiptNumber ?? ''}`);
      setShowPaymentForm(false);
      setPayAmount('');
      setPayDate(new Date().toISOString().split('T')[0]);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!clinicId) return;
    // F — حد جسم الطلب على Vercel هو 4.5MB: نرفض مبكراً برسالة عربية واضحة
    // بدلاً من 413 نصيّ من الحافة كان يفجّر res.json() ("Unexpected token 'R'").
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      setActionError(`الملف كبير جداً (${(file.size / 1024 / 1024).toFixed(1)}MB) — الحد الأقصى 4MB، ارفع نسخة أصغر أو مضغوطة`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('patient_id', patientId);
      const headers = await authHeaders();
      const res = await fetch(`/api/clinic/medical-files?clinic_id=${clinicId}&patient_id=${patientId}`, {
        method: 'POST',
        headers,
        body: form,
      });
      // قراءة نصية آمنة أولاً: أي خطأ حافة (413/502) يعيد HTML نصاً وليس JSON.
      const text = await res.text();
      let json: { error?: string } | null = null;
      try {
        json = text ? (JSON.parse(text) as { error?: string }) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw new Error(
          res.status === 413
            ? 'الملف تجاوز الحد المسموح (4MB) — ارفع نسخة أصغر'
            : json?.error || `فشل رفع الملف (${res.status})`
        );
      }
      if (!json) throw new Error('استجابة غير صالحة من الخادم');
      setActionSuccess('تم رفع الملف الطبي ✓');
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ في الرفع');
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const printInvoice = async (inv: InvoiceRow) => {
    const total = Number(inv.total_amount ?? inv.total ?? inv.total_due ?? 0);
    const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString('ar') : '—';
    const statusAr = inv.status === 'voided'
      ? 'ملغاة'
      : inv.status === 'paid'
        ? 'مدفوعة'
        : inv.status === 'partially_paid' ? 'مدفوعة جزئياً' : 'غير مدفوعة';

    // The printable invoice must list WHAT was billed. Old invoices were issued
    // before line items existed, so a missing/empty items list falls back to the
    // generic label instead of printing an empty table.
    let items: InvoiceItemRow[] = [];
    if (clinicId && inv.id) {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/accounting/invoices/${inv.id}?clinic_id=${clinicId}`, { headers });
        if (res.ok) {
          const json = await res.json();
          items = (json.data?.items ?? []) as InvoiceItemRow[];
        }
      } catch {
        items = [];
      }
    }
    const hasItems = items.length > 0;

    const w = window.open('', '_blank', 'width=760,height=800');
    if (!w) return;
    const title = `فاتورة ${inv.invoice_number ?? ''}`.trim();
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
  body { max-width: 640px; margin: 24px auto; padding: 32px; color: #111; background: #fff; }
  .brand { font-size: 20px; font-weight: 700; }
  .muted { color: #666; font-size: 12px; }
  .divider { border-top: 2px solid #111; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #333; padding: 8px 10px; font-size: 14px; text-align: right; }
  th { background: #f2f2f2; }
  .total-row td { font-weight: 700; background: #f8f8f8; }
  .stamp { margin-top: 28px; font-size: 14px; }
  h1 { font-size: 18px; margin: 2px 0 0; }
</style></head><body>
  <div class="brand">${clinicName ?? 'العيادة'}</div>
  <h1>${title}</h1>
  <p class="muted">فاتورة خدمات — ضريبة حسب النافذ</p>
  <div class="divider"></div>
  <table>
    <tr><th>المريض</th><td>${patientName ?? ''}</td></tr>
    <tr><th>رقم الفاتورة</th><td>${inv.invoice_number ?? inv.id.slice(0, 8)}</td></tr>
    <tr><th>التاريخ</th><td>${date}</td></tr>
    <tr><th>الحالة</th><td>${statusAr}</td></tr>
  </table>
  ${hasItems
    ? `<table>
        <thead><tr><th>الخدمة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${items.map((item) => `<tr>
            <td>${escapeHtml(item.description ?? '—')}</td>
            <td>${Number(item.quantity)}</td>
            <td>${Number(item.unit_price).toFixed(2)}</td>
            <td>${Number(item.line_total).toFixed(2)}</td>
          </tr>`).join('')}
          <tr class="total-row"><td colspan="3">إجمالي المبلغ</td><td>${total.toFixed(2)} ₪</td></tr>
        </tbody>
      </table>`
    : `<table>
        <tr><th>الخدمة</th><td>فاتورة خدمات العيادة (حسب السجل المالي)</td></tr>
        <tr class="total-row"><th>إجمالي المبلغ</th><td>${total.toFixed(2)} ₪</td></tr>
      </table>`}
  <div class="stamp">
    <p class="muted">تم الإصدار إلكترونياً من لوحة تحكم موظفة استقبال الأسنان الذكية.</p>
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };<\/script>
</body></html>`);
    w.document.close();
  };

  const invoiceTotal = useMemo(() => {
    const g = (r: InvoiceRow) => Number(r.total_amount ?? r.total ?? r.total_due ?? r.balance_due ?? 0);
    return invoices.reduce((s, r) => s + g(r), 0);
  }, [invoices]);

  const paymentTotal = useMemo(
    () => payments.filter((p) => p.status === 'recorded').reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [payments]
  );

  const balance = useMemo(() => {
    // patient_balances exposes `outstanding_amount` (NOT balance_due) — a wrong
    // column name here silently zeroed the whole balance display.
    const fromView = Number(balances[0]?.outstanding_amount ?? balances[0]?.balance_due);
    if (Number.isFinite(fromView)) return fromView;
    return invoiceTotal - paymentTotal;
  }, [balances, invoiceTotal, paymentTotal]);

  if (loading) {
    return <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">جارٍ تحميل الملف المالي والطبي...</div>;
  }
return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">الملف المالي والطبي {patientName ? `— ${patientName}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowInvoiceForm((v) => !v)}
            className="rounded-full bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
          >
            + إصدار فاتورة
          </button>
          <button
            type="button"
            onClick={() => setShowPaymentForm((v) => !v)}
            className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
          >
            + إضافة دفعة
          </button>
          <label
            className={`cursor-pointer rounded-full bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 ${uploadBusy ? 'opacity-50' : ''}`}
          >
            {uploadBusy ? 'جارٍ الرفع...' : '+ إرفاق ملف'}
            <input
              type="file"
              hidden
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime,application/dicom"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
      )}
      {actionError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{actionError}</div>
      )}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{actionSuccess}</div>
      )}

      {/* Balance summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-400">إجمالي الفواتير</p>
          <p className="mt-1 text-lg font-bold text-white">{invoiceTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-400">المدفوع</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">{paymentTotal.toFixed(2)}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${balance > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
          <p className="text-xs text-slate-400">الرصيد المتبقي</p>
          <p className={`mt-1 text-lg font-bold ${balance > 0 ? 'text-amber-300' : 'text-slate-300'}`}>{balance.toFixed(2)}</p>
        </div>
      </div>
{/* Invoice form */}
      {showInvoiceForm && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="mb-3 text-sm font-semibold text-white">
            {reissueFrom ? `🔄 إعادة إصدار من: ${reissueFrom}` : 'إصدار فاتورة جديدة'}
          </p>
          {reissueFrom && (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              الفاتورة الأصلية <span className="font-mono">{reissueFrom}</span> ملغاة — هذا نموذج مستقل يصدر فاتورة جديدة برقم تسلسلي جديد. عدّل المبلغ ثم أصدِر.
            </p>
          )}
          {/* Line items: the patient must see WHAT was billed, so each row is a
              catalog service (or a free-text label) with qty × price. */}
          <div className="space-y-2">
            {invLines.map((line, index) => (
              <div key={line.key} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <div className="space-y-1">
                  <select
                    value={line.service_id}
                    onChange={(e) => pickService(line.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/70 focus:outline-none"
                  >
                    <option value="">— خدمة من القائمة (أو اكتب وصفاً أدناه) —</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder={`وصف البند ${index + 1} (يُملأ تلقائياً عند اختيار خدمة)`}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/70 focus:outline-none"
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  placeholder="الكمية"
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/70 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unit_price}
                  onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                  placeholder="السعر"
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/70 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={invLines.length === 1}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-rose-500/60 hover:text-rose-300 disabled:opacity-40"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addLine}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-cyan-500/60"
            >
              + إضافة بند
            </button>
            <p className="text-sm text-slate-300">
              الإجمالي قبل الإصدار:{' '}
              <span className="font-bold text-cyan-300">{draftTotal.toFixed(2)} ₪</span>
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void issueInvoice()}
              disabled={submitting}
              className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {submitting ? 'جارٍ الإصدار...' : 'إصدار الفاتورة'}
            </button>
            <button
              type="button"
              onClick={() => setShowInvoiceForm(false)}
              className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Payment form */}
      {showPaymentForm && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="mb-3 text-sm font-semibold text-white">تسجيل دفعة</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <select
              value={payInvoiceId}
              onChange={(e) => setPayInvoiceId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/70 focus:outline-none sm:col-span-2"
            >
              <option value="">اختر الفاتورة...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number ?? 'فاتورة'} — {(inv.total_amount ?? inv.total ?? '')}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="المبلغ"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/70 focus:outline-none"
            />
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/70 focus:outline-none"
            >
              {Object.entries(METHOD_AR).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/70 focus:outline-none"
              aria-label="تاريخ الدفعة"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void recordPayment()}
              disabled={submitting}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? 'جارٍ التسجيل...' : 'تسجيل الدفعة'}
            </button>
            <button
              type="button"
              onClick={() => setShowPaymentForm(false)}
              className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
{/* Invoices list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="mb-3 text-sm font-semibold text-white">الفواتير ({invoices.length})</p>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد فواتير لهذا المريض.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-200">{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                  {inv.created_at && <p className="text-xs text-slate-500">{new Date(inv.created_at).toLocaleDateString('ar')}</p>}
                </div>
                <div className="text-left">
                  <p className="font-bold text-white">{Number(inv.total_amount ?? inv.total ?? 0).toFixed(2)}</p>
                  <p className={`text-xs ${inv.status === 'voided' ? 'text-rose-400' : inv.status === 'paid' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {inv.status === 'voided' ? 'ملغاة' : inv.status === 'paid' ? 'مدفوعة' : inv.status === 'partially_paid' ? 'مدفوعة جزئياً' : 'غير مدفوعة'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void printInvoice(inv)}
                    className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                    title="طباعة الفاتورة"
                  >
                    🖨️ طباعة
                  </button>
                  {inv.status !== 'voided' && (
                    <button
                      type="button"
                      onClick={() => openVoidDialog(inv)}
                      className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/30"
                      title="إلغاء الفاتورة (تبقى برقمها بحالة ملغاة)"
                    >
                      ❌ إلغاء
                    </button>
                  )}
                  {inv.status === 'voided' && (
                    <button
                      type="button"
                      onClick={() => void startReissue(inv)}
                      disabled={reissueBusy}
                      className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
                      title="إصدار فاتورة جديدة بنفس البيانات (المبلغ قابل للتعديل)"
                    >
                      {reissueBusy ? '…' : '🔄 إعادة إصدار'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Payments list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="mb-3 text-sm font-semibold text-white">الدفعات ({payments.length})</p>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد دفعات مسجلة لهذا المريض.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-200">
                    {METHOD_AR[p.method ?? ''] ?? p.method} {p.receipt_number ? `· ${p.receipt_number}` : ''}
                  </p>
                  {p.created_at && <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString('ar')}</p>}
                </div>
                <p className="font-bold text-emerald-300">+{Number(p.amount ?? 0).toFixed(2)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Medical files list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="mb-3 text-sm font-semibold text-white">الملفات الطبية ({files.length})</p>
        {files.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد ملفات طبية بعد. يمكنك إرفاق ملف أو نسخ مرفق من المحادثات.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{f.original_filename ?? f.file_type ?? 'ملف'}</p>
                  <p className="text-xs text-slate-500">
                    {f.file_type ?? ''} · {f.size_bytes != null ? `${(f.size_bytes / 1024).toFixed(1)} KB` : ''} ·{' '}
                    {f.created_at ? new Date(f.created_at).toLocaleDateString('ar') : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void openFile(f.id)}
                  className="rounded-full bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
                >
                  فتح
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Void invoice dialog — reason is mandatory (RPC: VOID_REASON_REQUIRED). */}
      {voidingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            role="presentation"
            onClick={() => {
              if (!voidBusy) setVoidingInvoice(null);
            }}
            className="absolute inset-0 bg-slate-950/80"
          />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white">❌ إلغاء الفاتورة</h2>
            <p className="mt-2 text-sm text-slate-300">
              الفاتورة: <span className="font-mono">{voidingInvoice.invoice_number ?? ''}</span> —{' '}
              <span className="font-bold">{Number(voidingInvoice.total_amount ?? voidingInvoice.total ?? 0).toFixed(2)}₪</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              تبقى الفاتورة محفوظة برقمها بحالة «ملغاة» (لا تُحذف أبداً). فاتورة عليها دفعات مسجلة يجب عكس دفعاتها أولاً.
            </p>
            <label className="mt-4 block text-xs text-slate-400">سبب الإلغاء (إلزامي):</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              placeholder="مثال: خطأ في السعر — 330 بدلاً من 30"
              className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500/70 focus:outline-none"
            />
            {voidError && (
              <div role="alert" className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {voidError}
              </div>
            )}
            <div className="mt-5 flex justify-start gap-3">
              <button
                type="button"
                onClick={() => void confirmVoid()}
                disabled={!voidReason.trim() || voidBusy}
                className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {voidBusy ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
              <button
                type="button"
                onClick={() => setVoidingInvoice(null)}
                disabled={voidBusy}
                className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}