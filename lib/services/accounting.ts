// STEP 2 — Accounting Phase A: Patient Finance service layer.
// Server-only. All financial mutations go through the atomic DB RPCs
// (issue_invoice / record_payment / void_payment / refund_payment / void_invoice)
// which enforce the financial invariants (insert-only, void-not-delete,
// derived balances, tenant-scoped composite FKs) at the database level.
// Platform Billing (subscriptions/billing_plans/Stripe) is never touched here.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/services/auditService';
import { resolveCanonicalServiceIds } from '@/lib/services/clinicServiceCatalog';

export type InvoiceItemInput = {
  service_id?: string | null;
  provider_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

export type IssueInvoiceInput = {
  clinicId: string;
  patientId: string;
  appointmentId?: string | null;
  items: InvoiceItemInput[];
  discount?: number;
  tax?: number;
  notes?: string | null;
  dueAt?: string | null;
  payerType?: 'patient' | 'insurance' | 'employer' | 'third_party' | null;
  payerRef?: string | null;
  actorUserId: string | null;
};

export type RecordPaymentInput = {
  clinicId: string;
  invoiceId: string;
  amount: number;
  method: 'cash' | 'card' | 'bank_transfer' | 'insurance' | 'other';
  reference?: string | null;
  idempotencyKey?: string | null;
  payerType?: 'patient' | 'insurance' | 'employer' | 'third_party' | null;
  payerRef?: string | null;
  /** Optional backdated payment date (ISO) — defaults to now() server-side. */
  paymentDate?: string | null;
  actorUserId: string | null;
};

export type InvoiceWithItems = Record<string, unknown> & {
  items: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
};

function invalidParams(input: IssueInvoiceInput): string | null {
  if (!input.items || input.items.length === 0) return 'INVOICE_ITEMS_REQUIRED';
  for (const item of input.items) {
    if (!item.description || item.description.trim().length === 0) return 'ITEM_DESCRIPTION_REQUIRED';
    if (!(item.quantity > 0)) return 'ITEM_QUANTITY_INVALID';
    if (!(item.unit_price >= 0)) return 'ITEM_PRICE_INVALID';
  }
  if ((input.discount ?? 0) < 0) return 'DISCOUNT_INVALID';
  if ((input.tax ?? 0) < 0) return 'TAX_INVALID';
  if (input.payerType != null && !['patient', 'insurance', 'employer', 'third_party'].includes(input.payerType)) return 'INVALID_PAYER_TYPE';
  return null;
}

/**
 * B50 — a raw Postgres error must never reach the owner's screen. The invoice
 * screen used to print the literal FK text
 * (`... violates foreign key constraint "invoice_items_clinic_id_service_id_fkey"`).
 * Each mapping below is a stable code the API route turns into Arabic.
 */
export function friendlyInvoiceError(message: string): string {
  if (/invoice_items_clinic_id_service_id_fkey/i.test(message)) return 'SERVICE_NOT_IN_CATALOG';
  if (/invoice_items_clinic_id_invoice_id_fkey|clinic_invoices/i.test(message) && /foreign key|violates/i.test(message)) {
    return 'INVOICE_LINK_INVALID';
  }
  if (/patient/i.test(message) && /foreign key|violates/i.test(message)) return 'PATIENT_NOT_FOUND';
  // Anything still shaped like SQL / a constraint name is hidden as a generic
  // save failure — the real text stays in the server logs (writeAuditLog below).
  if (/violates|constraint|foreign key|syntax error|duplicate key/i.test(message)) return 'INVOICE_SAVE_FAILED';
  if (/column .+ does not exist|relation .+ does not exist/i.test(message)) return 'INVOICE_SAVE_FAILED';
  return message;
}

/** Issues an invoice (directly as `issued` — no draft in Phase A). */
export async function issueInvoice(input: IssueInvoiceInput): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const bad = invalidParams(input);
  if (bad) throw new Error(bad);

  // B50 — `GET /api/clinic/services` is the ACTIVITY-AWARE catalog
  // (clinicServiceCatalog), so an imaging centre / dental lab posts DOMAIN ids
  // while `invoice_items` is FK-bound to the CANONICAL `clinic_services`. Map
  // them before the RPC so a domain id becomes its by-name mirror (or is
  // dropped to NULL) instead of failing the whole invoice.
  const resolution = await resolveCanonicalServiceIds(
    input.clinicId,
    input.items.map((item) => item.service_id ?? null)
  );
  const resolvedItems = input.items.map((item) => ({
    ...item,
    service_id: item.service_id ? resolution.get(item.service_id)?.canonical ?? null : null,
  }));

  const { data, error } = await supabaseAdmin.rpc('issue_invoice', {
    p_clinic_id: input.clinicId,
    p_patient_id: input.patientId,
    p_appointment_id: input.appointmentId ?? null,
    p_items: resolvedItems.map((item) => ({
      service_id: item.service_id ?? null,
      provider_id: item.provider_id ?? null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
    p_discount: input.discount ?? 0,
    p_tax: input.tax ?? 0,
    p_notes: input.notes ?? null,
    p_due_at: input.dueAt ?? null,
    p_created_by: input.actorUserId,
    p_payer_type: input.payerType ?? null,
    p_payer_ref: input.payerRef ?? null,
  });
  if (error) throw new Error(friendlyInvoiceError(error.message));
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'invoice_issued',
    resourceType: 'clinic_invoices',
    resourceId: data?.invoice_id,
    metadata: { invoice_number: data?.invoice_number },
  });
  return { invoiceId: data?.invoice_id, invoiceNumber: data?.invoice_number };
}

/** Records a payment (full/partial/multiple; overpayment allowed → patient credit). */
export async function recordPayment(input: RecordPaymentInput): Promise<{ paymentId: string; receiptNumber: string | null }> {
  if (!(input.amount > 0)) throw new Error('PAYMENT_AMOUNT_INVALID');
  if (input.payerType != null && !['patient', 'insurance', 'employer', 'third_party'].includes(input.payerType)) throw new Error('INVALID_PAYER_TYPE');
  const { data, error } = await supabaseAdmin.rpc('record_payment', {
    p_clinic_id: input.clinicId,
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_recorded_by: input.actorUserId,
    p_payer_type: input.payerType ?? null,
    p_payer_ref: input.payerRef ?? null,
    // Optional backdated payment date — defaults to now() when omitted.
    ...(input.paymentDate ? { p_payment_date: new Date(input.paymentDate).toISOString() } : {}),
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payment_recorded',
    resourceType: 'clinic_payments',
    resourceId: data?.payment_id,
    metadata: { invoice_id: input.invoiceId, amount: input.amount, method: input.method, duplicate: Boolean(data?.duplicate) },
  });
  return { paymentId: data?.payment_id, receiptNumber: data?.receipt_number ?? null };
}

export type VoidPaymentInput = {
  clinicId: string;
  paymentId: string;
  reason: string;
  actorUserId: string | null;
};

/** Voids a recorded payment (kept in ledger; excluded from paid totals). */
export async function voidPayment(input: VoidPaymentInput): Promise<void> {
  const { error } = await supabaseAdmin.rpc('void_payment', {
    p_clinic_id: input.clinicId,
    p_payment_id: input.paymentId,
    p_reason: input.reason,
    p_voided_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payment_voided',
    resourceType: 'clinic_payments',
    resourceId: input.paymentId,
    metadata: { reason: input.reason },
  });
}

export type RefundPaymentInput = {
  clinicId: string;
  paymentId: string;
  amount: number;
  reason: string;
  actorUserId: string | null;
};

/** Records a refund against a recorded payment (capped at the net paid amount). */
export async function refundPayment(input: RefundPaymentInput): Promise<{ refundPaymentId: string }> {
  if (!(input.amount > 0)) throw new Error('REFUND_AMOUNT_INVALID');
  const { data, error } = await supabaseAdmin.rpc('refund_payment', {
    p_clinic_id: input.clinicId,
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_refunded_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'refund_recorded',
    resourceType: 'clinic_payments',
    resourceId: data,
    metadata: { original_payment_id: input.paymentId, amount: input.amount, reason: input.reason },
  });
  return { refundPaymentId: data as string };
}

export type VoidInvoiceInput = {
  clinicId: string;
  invoiceId: string;
  reason: string;
  actorUserId: string | null;
};

/** Voids an issued invoice (kept + numbered; no payments can attach afterwards). */
export async function voidInvoice(input: VoidInvoiceInput): Promise<void> {
  const { error } = await supabaseAdmin.rpc('void_invoice', {
    p_clinic_id: input.clinicId,
    p_invoice_id: input.invoiceId,
    p_reason: input.reason,
    p_voided_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'invoice_voided',
    resourceType: 'clinic_invoices',
    resourceId: input.invoiceId,
    metadata: { reason: input.reason },
  });
}

// --- Read-only queries (derived balances — never stored numbers) ---

export async function listInvoices(
  clinicId: string,
  patientId?: string | null,
  status?: 'paid' | 'unpaid' | 'voided' | null,
  limit = 50,
) {
  let query = supabaseAdmin
    .from('clinic_invoices')
    .select('*, patients!clinic_invoices_clinic_id_patient_id_fkey(full_name)')
    .eq('clinic_id', clinicId)
    .order('invoice_number', { ascending: false })
    .limit(limit);
  if (patientId) query = query.eq('patient_id', patientId);
  if (status === 'paid') query = query.eq('status', 'paid');
  else if (status === 'unpaid') query = query.in('status', ['issued', 'partially_paid']);
  else if (status === 'voided') query = query.eq('status', 'voided');
  else query = query.neq('status', 'voided');

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const invoices = data ?? [];
  if (!invoices.length) return [];

  const activeInvoiceIds = invoices.filter((invoice) => invoice.status !== 'voided').map((invoice) => invoice.id);
  const balanceByInvoiceId = new Map<string, Record<string, unknown>>();
  if (activeInvoiceIds.length) {
    const { data: balances, error: balanceError } = await supabaseAdmin
      .from('invoice_balances')
      .select('invoice_id, paid_amount, written_off_amount, balance_amount')
      .eq('clinic_id', clinicId)
      .in('invoice_id', activeInvoiceIds);
    if (balanceError) throw new Error(balanceError.message);
    for (const balance of balances ?? []) balanceByInvoiceId.set(balance.invoice_id, balance);
  }

  return invoices.map((invoice) => {
    const patient = Array.isArray(invoice.patients) ? invoice.patients[0] : invoice.patients;
    const balance = balanceByInvoiceId.get(invoice.id);
    return {
      ...invoice,
      patient_name: patient?.full_name ?? null,
      paid_amount: balance?.paid_amount ?? 0,
      written_off_amount: balance?.written_off_amount ?? 0,
      balance_amount: balance?.balance_amount ?? 0,
    };
  });
}

export async function getInvoiceDetail(clinicId: string, invoiceId: string): Promise<InvoiceWithItems | null> {
  const [invRes, itemsRes, payRes] = await Promise.all([
    supabaseAdmin.from('clinic_invoices').select('*').eq('clinic_id', clinicId).eq('id', invoiceId).maybeSingle(),
    supabaseAdmin.from('invoice_items').select('*').eq('clinic_id', clinicId).eq('invoice_id', invoiceId).order('created_at'),
    supabaseAdmin.from('clinic_payments').select('*').eq('clinic_id', clinicId).eq('invoice_id', invoiceId).order('created_at'),
  ]);
  if (invRes.error) throw new Error(invRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (!invRes.data) return null;
  return { ...invRes.data, items: itemsRes.data ?? [], payments: payRes.data ?? [] };
}

export async function listPayments(
  clinicId: string,
  invoiceId?: string | null,
  limit = 50,
  patientId?: string | null,
) {
  let query = supabaseAdmin
    .from('clinic_payments')
    .select(patientId
      ? '*, clinic_invoices!clinic_payments_clinic_id_invoice_id_fkey!inner(invoice_number, patient_id, patients!clinic_invoices_clinic_id_patient_id_fkey(full_name))'
      : '*, clinic_invoices!clinic_payments_clinic_id_invoice_id_fkey(invoice_number, patients!clinic_invoices_clinic_id_patient_id_fkey(full_name))')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (invoiceId) query = query.eq('invoice_id', invoiceId);
  if (patientId) query = query.eq('clinic_invoices.patient_id', patientId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((payment) => {
    const invoice = Array.isArray(payment.clinic_invoices) ? payment.clinic_invoices[0] : payment.clinic_invoices;
    const patient = Array.isArray(invoice?.patients) ? invoice.patients[0] : invoice?.patients;
    return {
      ...payment,
      invoice_number: invoice?.invoice_number ?? null,
      patient_name: patient?.full_name ?? null,
    };
  });
}

export async function getPatientBalances(clinicId: string, patientId?: string | null) {
  let query = supabaseAdmin.from('patient_balances').select('*').eq('clinic_id', clinicId);
  if (patientId) query = query.eq('patient_id', patientId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
// --- Accounting Phase B: write-offs (D-B2) + aging (D-B5) ---

export type RecordWriteOffInput = {
  clinicId: string;
  invoiceId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string | null;
  actorUserId: string | null;
};

export type WriteOffResult = {
  adjustmentId: string;
  amount: number;
  availableBefore: number;
  remaining: number;
};

/** Records a write-off against the current available invoice balance. */
export async function recordWriteOff(input: RecordWriteOffInput): Promise<WriteOffResult> {
  if (!(input.amount > 0)) throw new Error('WRITE_OFF_AMOUNT_INVALID');
  if (!input.reason || input.reason.trim().length === 0) throw new Error('WRITE_OFF_REASON_REQUIRED');
  const { data, error } = await supabaseAdmin.rpc('record_write_off', {
    p_clinic_id: input.clinicId,
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_recorded_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'write_off_recorded',
    resourceType: 'clinic_adjustments',
    resourceId: data?.adjustment_id,
    metadata: { invoice_id: input.invoiceId, amount: input.amount, reason: input.reason },
  });
  return {
    adjustmentId: data?.adjustment_id,
    amount: Number(data?.amount ?? input.amount),
    availableBefore: Number(data?.available_before ?? 0),
    remaining: Number(data?.remaining ?? 0),
  };
}

export type WriteOffRow = Record<string, unknown>;

export async function listWriteOffs(clinicId: string, invoiceId?: string | null) {
  let query = supabaseAdmin
    .from('clinic_adjustments')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });
  if (invoiceId) query = query.eq('invoice_id', invoiceId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as WriteOffRow[];
}

export type AgingBucket = {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  invoices: number;
  balance: number;
};

export type AgingSummary = {
  buckets: AgingBucket[];
  totalOutstanding: number;
  rows: Array<Record<string, unknown>>;
};

const AGING_BUCKET_ORDER: AgingBucket['bucket'][] = ['current', '1-30', '31-60', '61-90', '90+'];

/** Derived aging summary for one clinic (read-only, never stored). */
export async function getAgingSummary(clinicId: string, patientId?: string | null): Promise<AgingSummary> {
  let query = supabaseAdmin
    .from('receivable_aging')
    .select('*')
    .eq('clinic_id', clinicId);
  if (patientId) query = query.eq('patient_id', patientId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const buckets = AGING_BUCKET_ORDER.map((bucket) => ({
    bucket,
    invoices: rows.filter((r) => r.bucket === bucket).length,
    balance: rows
      .filter((r) => r.bucket === bucket)
      .reduce((sum, r) => sum + Number(r.balance_amount ?? 0), 0),
  }));
  const totalOutstanding = rows.reduce((sum, r) => sum + Number(r.balance_amount ?? 0), 0);
  return { buckets, totalOutstanding, rows };
}

// --- Accounting Phase C: expenses, categories, cash register, daily closing ---

export type ExpenseMethod = 'cash' | 'card' | 'bank_transfer' | 'other';
const EXPENSE_METHODS: ExpenseMethod[] = ['cash', 'card', 'bank_transfer', 'other'];

export type RecordExpenseInput = {
  clinicId: string;
  categoryId?: string | null;
  amount: number;
  method: ExpenseMethod;
  spentAt?: string | null;
  vendor?: string | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  actorUserId: string | null;
};

export type ExpenseResult = {
  expenseId: string;
  expenseNumber: string;
  duplicate: boolean;
};

/** Records an immutable expense movement via the atomic `record_expense` RPC. */
export async function recordExpense(input: RecordExpenseInput): Promise<ExpenseResult> {
  if (!(input.amount > 0)) throw new Error('EXPENSE_AMOUNT_INVALID');
  if (!EXPENSE_METHODS.includes(input.method)) throw new Error('EXPENSE_METHOD_INVALID');
  const { data, error } = await supabaseAdmin.rpc('record_expense', {
    p_clinic_id: input.clinicId,
    p_category_id: input.categoryId ?? null,
    p_amount: input.amount,
    p_method: input.method,
    p_spent_at: input.spentAt ?? null,
    p_vendor: input.vendor ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_recorded_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'expense_recorded',
    resourceType: 'clinic_expenses',
    resourceId: data?.expense_id,
    metadata: {
      expense_number: data?.expense_number,
      amount: input.amount,
      method: input.method,
      category_id: input.categoryId ?? null,
      vendor: input.vendor ?? null,
    },
  });
  return {
    expenseId: data?.expense_id,
    expenseNumber: data?.expense_number,
    duplicate: Boolean(data?.duplicate),
  };
}

/** Voids an expense (bookkeeping only — nothing is deleted or mutated). */
export async function voidExpense(input: {
  clinicId: string;
  expenseId: string;
  reason: string;
  actorUserId: string | null;
}): Promise<void> {
  if (!input.reason || input.reason.trim().length === 0) throw new Error('VOID_REASON_REQUIRED');
  const { error } = await supabaseAdmin.rpc('void_expense', {
    p_clinic_id: input.clinicId,
    p_expense_id: input.expenseId,
    p_reason: input.reason,
    p_voided_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'expense_voided',
    resourceType: 'clinic_expenses',
    resourceId: input.expenseId,
    metadata: { reason: input.reason },
  });
}

export type ExpenseRow = Record<string, unknown>;

export async function listExpenses(
  clinicId: string,
  filters?: {
    categoryId?: string | null;
    status?: string | null;
    from?: string | null;
    to?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: ExpenseRow[]; hasMore: boolean }> {
  const limit = Math.min(100, Math.max(1, Math.floor(filters?.limit ?? 50)));
  const offset = Math.max(0, Math.floor(filters?.offset ?? 0));
  let query = supabaseAdmin
    .from('clinic_expenses')
    .select('*, category:clinic_expense_categories(name)')
    .eq('clinic_id', clinicId)
    .order('spent_at', { ascending: false });
  if (filters?.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.from) query = query.gte('spent_at', filters.from);
  if (filters?.to) query = query.lte('spent_at', filters.to);
  query = query.range(offset, offset + limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit).map((row) => {
      const category = row.category as { name?: string } | Array<{ name?: string }> | null;
      const categoryRecord = Array.isArray(category) ? category[0] : category;
      return { ...row, category_name: categoryRecord?.name ?? null };
    }),
    hasMore,
  };
}

export async function updateExpense(input: {
  clinicId: string;
  expenseId: string;
  notes?: string | null;
  vendor?: string | null;
  categoryId?: string | null;
  actorUserId: string | null;
}): Promise<ExpenseRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.vendor !== undefined) patch.vendor = input.vendor;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;

  const { data, error } = await supabaseAdmin
    .from('clinic_expenses')
    .update(patch)
    .eq('clinic_id', input.clinicId)
    .eq('id', input.expenseId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('EXPENSE_NOT_FOUND');

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'expense_updated',
    resourceType: 'clinic_expenses',
    resourceId: input.expenseId,
    metadata: {
      notes: input.notes ?? null,
      vendor: input.vendor ?? null,
      category_id: input.categoryId ?? null,
    },
  });

  return data as ExpenseRow;
}

export async function updateExpenseAttachment(input: {
  clinicId: string;
  expenseId: string;
  path: string | null;
  actorUserId: string | null;
}): Promise<ExpenseRow> {
  const { data, error } = await supabaseAdmin
    .from('clinic_expenses')
    .update({ attachment_url: input.path, updated_at: new Date().toISOString() })
    .eq('clinic_id', input.clinicId)
    .eq('id', input.expenseId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('EXPENSE_NOT_FOUND');

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: input.path ? 'expense_attachment_uploaded' : 'expense_attachment_removed',
    resourceType: 'clinic_expenses',
    resourceId: input.expenseId,
    metadata: { attachment_path: input.path },
  });

  return data as ExpenseRow;
}

export async function deleteExpenseAttachment(input: {
  clinicId: string;
  expenseId: string;
  actorUserId: string | null;
}): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('clinic_expenses')
    .select('attachment_url')
    .eq('clinic_id', input.clinicId)
    .eq('id', input.expenseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('EXPENSE_NOT_FOUND');
  const currentPath = (data as { attachment_url?: string | null }).attachment_url ?? null;

  if (currentPath) {
    const { error: removeError } = await supabaseAdmin.storage.from('expense-attachments').remove([currentPath]);
    if (removeError) throw new Error(removeError.message);
  }

  await updateExpenseAttachment({
    clinicId: input.clinicId,
    expenseId: input.expenseId,
    path: null,
    actorUserId: input.actorUserId,
  });
}

export async function getExpenseAttachmentSignedUrl(
  clinicId: string,
  expenseId: string,
  path: string | null | undefined,
  seconds = 3600,
  downloadFilename?: string
): Promise<string | null> {
  const storagePath = (path ?? '').trim();
  if (!storagePath) return null;
  if (!storagePath.startsWith(`${clinicId}/${expenseId}/`)) {
    throw new Error('EXPENSE_ATTACHMENT_PATH_INVALID');
  }

  const bucket = supabaseAdmin.storage.from('expense-attachments');
  const { data, error } = downloadFilename
    ? await bucket.createSignedUrl(storagePath, seconds, { download: downloadFilename })
    : await bucket.createSignedUrl(storagePath, seconds);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error('EXPENSE_ATTACHMENT_SIGNED_URL_FAILED');
  return data.signedUrl;
}


export type ExpenseCategoryRow = Record<string, unknown>;

export async function listExpenseCategories(clinicId: string): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('clinic_expense_categories')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseCategoryRow[];
}

export async function createExpenseCategory(input: {
  clinicId: string;
  name: string;
  actorUserId: string | null;
}): Promise<ExpenseCategoryRow> {
  const name = input.name?.trim();
  if (!name) throw new Error('CATEGORY_NAME_REQUIRED');
  const { data, error } = await supabaseAdmin
    .from('clinic_expense_categories')
    .insert({ clinic_id: input.clinicId, name, created_by: input.actorUserId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'expense_category_created',
    resourceType: 'clinic_expense_categories',
    resourceId: (data as ExpenseCategoryRow)?.id as string,
    metadata: { name },
  });
  return data as ExpenseCategoryRow;
}

export async function updateExpenseCategory(input: {
  clinicId: string;
  categoryId: string;
  name?: string | null;
  isActive?: boolean | null;
  actorUserId: string | null;
}): Promise<ExpenseCategoryRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name != null) {
    const name = input.name.trim();
    if (!name) throw new Error('CATEGORY_NAME_REQUIRED');
    patch.name = name;
  }
  if (input.isActive != null) patch.is_active = input.isActive;
  const { data, error } = await supabaseAdmin
    .from('clinic_expense_categories')
    .update(patch)
    .eq('clinic_id', input.clinicId)
    .eq('id', input.categoryId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'expense_category_updated',
    resourceType: 'clinic_expense_categories',
    resourceId: input.categoryId,
    metadata: { name: input.name ?? null, is_active: input.isActive ?? null },
  });
  return data as ExpenseCategoryRow;
}

export type CashSessionRow = Record<string, unknown>;

export async function openCashSession(input: {
  clinicId: string;
  openingAmount: number;
  actorUserId: string | null;
}): Promise<{ sessionId: string; openingAmount: number }> {
  if (!(input.openingAmount >= 0)) throw new Error('CASH_OPENING_INVALID');
  const { data, error } = await supabaseAdmin.rpc('open_cash_session', {
    p_clinic_id: input.clinicId,
    p_opening_amount: input.openingAmount,
    p_opened_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'cash_session_opened',
    resourceType: 'clinic_cash_sessions',
    resourceId: data?.session_id,
    metadata: { opening_amount: input.openingAmount },
  });
  return { sessionId: data?.session_id, openingAmount: Number(data?.opening_amount ?? input.openingAmount) };
}


export type CloseCashSessionResult = {
  sessionId: string;
  openingAmount: number;
  cashIn: number;
  cashOut: number;
  expectedClosing: number;
  countedAmount: number;
  variance: number;
};

/**
 * Closes the open cash session. Expected cash is computed by the RPC from
 * EXPLICIT ledger kinds (payment_recorded / refund_recorded / expense_recorded,
 * method='cash') — never from `direction`. Variance is a displayed snapshot
 * only; it is never booked to the ledger (pending documented owner decision).
 */
export async function closeCashSession(input: {
  clinicId: string;
  sessionId: string;
  countedAmount: number;
  notes?: string | null;
  actorUserId: string | null;
}): Promise<CloseCashSessionResult> {
  if (!(input.countedAmount >= 0)) throw new Error('CASH_COUNTED_INVALID');
  const { data, error } = await supabaseAdmin.rpc('close_cash_session', {
    p_clinic_id: input.clinicId,
    p_session_id: input.sessionId,
    p_counted_amount: input.countedAmount,
    p_notes: input.notes ?? null,
    p_closed_by: input.actorUserId,
  });
  if (error) throw new Error(error.message);
  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'cash_session_closed',
    resourceType: 'clinic_cash_sessions',
    resourceId: input.sessionId,
    metadata: {
      expected_closing: Number(data?.expected_closing ?? 0),
      counted_amount: input.countedAmount,
      variance: Number(data?.variance ?? 0),
    },
  });
  return {
    sessionId: data?.session_id,
    openingAmount: Number(data?.opening_amount ?? 0),
    cashIn: Number(data?.cash_in ?? 0),
    cashOut: Number(data?.cash_out ?? 0),
    expectedClosing: Number(data?.expected_closing ?? 0),
    countedAmount: Number(data?.counted_amount ?? input.countedAmount),
    variance: Number(data?.variance ?? 0),
  };
}

export async function listCashSessions(clinicId: string): Promise<CashSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('clinic_cash_sessions')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('opened_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CashSessionRow[];
}

export type DailyCashPosition = {
  businessDate: string;
  cashIn: number;
  cashOut: number;
  netCash: number;
};

/** Derived daily cash positions (read-only view — never stored). */
export async function getDailyCashPositions(
  clinicId: string,
  from?: string | null,
  to?: string | null
): Promise<DailyCashPosition[]> {
  let query = supabaseAdmin
    .from('daily_cash_positions')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('business_date', { ascending: false });
  if (from) query = query.gte('business_date', from);
  if (to) query = query.lte('business_date', to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    businessDate: String(row.business_date),
    cashIn: Number(row.cash_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    netCash: Number(row.net_cash ?? 0),
  }));
}
