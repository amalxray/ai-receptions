/**
 * Payroll Engine — Phase 1 (generation · approval · payment).
 *
 * Sources of truth (never duplicated):
 *   providers                    → the staff registry (D-P1: provider_type
 *                                  'staff'/'dentist'/… ; user_id → auth.users)
 *   clinic_provider_compensations → the pay model (commission / fixed / hybrid)
 *   public.provider_revenue       → DERIVED attributed revenue, 'issued' base,
 *                                  clinic-local month (D-P2). Commission math
 *                                  NEVER re-derives revenue from invoice rows:
 *                                  doing so would count VOIDED invoices.
 *   clinic_settings.currency      → one currency per clinic (D3)
 *   staff_advances / payslip_adjustments → advances, bonuses, deductions
 *   financial_transactions        → append-only ledger (`payroll_run` on pay)
 *
 * Money is rounded to 2 decimals through `round2` only, so service math and
 * numeric(12,2) columns always agree.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';

export type CompensationModel = 'commission_percentage' | 'fixed_monthly' | 'hybrid';
export type PayrollPeriodStatus = 'draft' | 'approved' | 'paid' | 'cancelled';

export type ProviderBreakdown = {
  provider_id: string;
  provider_name: string;
  model: CompensationModel;
  base_amount: number;
  commission_amount: number;
  bonuses_amount: number;
  deductions_amount: number;
  advances_amount: number;
  net_amount: number;
  revenue_attributed: number;
  currency: string;
};

export type PayrollTotals = {
  base: number;
  commission: number;
  bonuses: number;
  deductions: number;
  advances: number;
  net: number;
};

export type GeneratePayrollResult = {
  period_id: string;
  period_month: string;
  currency: string;
  breakdown: ProviderBreakdown[];
  totals: PayrollTotals;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** D3 — one currency per clinic; ILS stays the fallback for legacy clinics. */
async function resolveCurrency(clinicId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('clinic_settings')
    .select('currency')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return (data?.currency as string | undefined) ?? 'ILS';
}

/** Month boundaries are NOT computed here — provider_revenue is clinic-local (D3). */
export function monthStart(periodMonth: string): string {
  return `${periodMonth}-01`;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
export async function generatePayrollPeriod(input: {
  clinicId: string;
  periodMonth: string;
  actorUserId: string | null;
}): Promise<GeneratePayrollResult> {
  const { clinicId, periodMonth } = input;

  if (!MONTH_RE.test(periodMonth)) throw new Error('PAYROLL_PERIOD_MONTH_INVALID');

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('payroll_periods')
    .select('id, status')
    .eq('clinic_id', clinicId)
    .eq('period_month', periodMonth)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.status !== 'draft') throw new Error('PERIOD_ALREADY_FINALIZED');

  const currency = await resolveCurrency(clinicId);

  let periodId = existing?.id as string | undefined;
  if (!periodId) {
    const { data: period, error } = await supabaseAdmin
      .from('payroll_periods')
      .insert({
        clinic_id: clinicId,
        period_month: periodMonth,
        status: 'draft',
        currency,
        created_by: input.actorUserId,
      })
      .select('id')
      .single();
    if (error || !period) {
      logEvent('payroll_period_create_error', { clinic_id: clinicId, error: error?.message }, 'error');
      throw new Error(error?.message ?? 'PAYROLL_PERIOD_CREATE_FAILED');
    }
    periodId = period.id as string;
  } else {
    // Regenerating a draft: payslips are engine-owned and rebuilt from scratch.
    // The DB trigger only permits this while the period is still a draft.
    const { error: clearError } = await supabaseAdmin
      .from('payslips')
      .delete()
      .eq('payroll_period_id', periodId);
    if (clearError) throw new Error(clearError.message);
  }

  // 1) Active pay models for this clinic.
  const { data: compensations, error: compError } = await supabaseAdmin
    .from('clinic_provider_compensations')
    .select('provider_id, model, commission_percent, fixed_monthly_amount')
    .eq('clinic_id', clinicId)
    .eq('status', 'active');
  if (compError) throw new Error(compError.message);

  const rows = compensations ?? [];
  const providerIds = rows.map((r) => r.provider_id as string);
  const periodStart = monthStart(periodMonth);

  // 2) Provider names (explicit two-step read instead of an embed), skipping
  //    soft-deleted providers — they must never be paid.
  const providerNames = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providers } = await supabaseAdmin
      .from('providers')
      .select('id, name, deleted_at')
      .eq('clinic_id', clinicId)
      .in('id', providerIds);
    (providers ?? []).forEach((p) => {
      if (!p.deleted_at) providerNames.set(p.id as string, (p.name as string) ?? '');
    });
  }

  // 3) Attributed revenue for the month — DERIVED view (D-P2, 'issued' base,
  //    non-voided invoices, clinic-local month).
  const revenueByProvider = new Map<string, number>();
  const { data: revenue, error: revenueError } = await supabaseAdmin
    .from('provider_revenue')
    .select('provider_id, issued_revenue')
    .eq('clinic_id', clinicId)
    .eq('revenue_month', periodStart);
  if (revenueError) throw new Error(revenueError.message);
  (revenue ?? []).forEach((r) => {
    revenueByProvider.set(r.provider_id as string, num(r.issued_revenue));
  });

  // 4) Pending advances — money already handed to the person.
  const advancesByProvider = new Map<string, { total: number; ids: string[] }>();
  const { data: advances, error: advancesError } = await supabaseAdmin
    .from('staff_advances')
    .select('id, provider_id, amount')
    .eq('clinic_id', clinicId)
    .eq('status', 'pending');
  if (advancesError) throw new Error(advancesError.message);
  (advances ?? []).forEach((a) => {
    const bucket = advancesByProvider.get(a.provider_id as string) ?? { total: 0, ids: [] };
    bucket.total = round2(bucket.total + num(a.amount));
    bucket.ids.push(a.id as string);
    advancesByProvider.set(a.provider_id as string, bucket);
  });

  // 5) Bonuses / deductions attached to THIS period (the spec never read these
  //    back into the payslip, so bonuses/deductions were always 0).
  const adjustmentsByProvider = new Map<string, { bonuses: number; deductions: number }>();
  const { data: adjustments, error: adjustmentsError } = await supabaseAdmin
    .from('payslip_adjustments')
    .select('provider_id, type, amount')
    .eq('payroll_period_id', periodId);
  if (adjustmentsError) throw new Error(adjustmentsError.message);
  (adjustments ?? []).forEach((a) => {
    const bucket = adjustmentsByProvider.get(a.provider_id as string) ?? { bonuses: 0, deductions: 0 };
    if (a.type === 'bonus') bucket.bonuses = round2(bucket.bonuses + num(a.amount));
    else bucket.deductions = round2(bucket.deductions + num(a.amount));
    adjustmentsByProvider.set(a.provider_id as string, bucket);
  });

  // 6) Build the payslips.
  const breakdown: ProviderBreakdown[] = [];
  const totals: PayrollTotals = { base: 0, commission: 0, bonuses: 0, deductions: 0, advances: 0, net: 0 };

  for (const comp of rows) {
    const providerId = comp.provider_id as string;
    if (!providerNames.has(providerId)) continue;

    const model = comp.model as CompensationModel;
    const revenueAttributed = revenueByProvider.get(providerId) ?? 0;
    const advance = advancesByProvider.get(providerId) ?? { total: 0, ids: [] };
    const adjustment = adjustmentsByProvider.get(providerId) ?? { bonuses: 0, deductions: 0 };

    const base = model === 'fixed_monthly' || model === 'hybrid'
      ? round2(num(comp.fixed_monthly_amount))
      : 0;
    const commission = model === 'commission_percentage' || model === 'hybrid'
      ? round2((revenueAttributed * num(comp.commission_percent)) / 100)
      : 0;

    const net = round2(base + commission + adjustment.bonuses - adjustment.deductions - advance.total);

    breakdown.push({
      provider_id: providerId,
      provider_name: providerNames.get(providerId) ?? '',
      model,
      base_amount: base,
      commission_amount: commission,
      bonuses_amount: adjustment.bonuses,
      deductions_amount: adjustment.deductions,
      advances_amount: advance.total,
      net_amount: net,
      revenue_attributed: revenueAttributed,
      currency,
    });

    const { error: slipError } = await supabaseAdmin.from('payslips').insert({
      payroll_period_id: periodId,
      clinic_id: clinicId,
      provider_id: providerId,
      base_amount: base,
      commission_amount: commission,
      bonuses_amount: adjustment.bonuses,
      deductions_amount: adjustment.deductions,
      advances_amount: advance.total,
      revenue_attributed: revenueAttributed,
      net_amount: net,
      currency,
      breakdown: {
        revenue_attributed: revenueAttributed,
        advances_ids: advance.ids,
        bonus_lines: (adjustments ?? []).filter((a) => a.provider_id === providerId && a.type === 'bonus'),
        deduction_lines: (adjustments ?? []).filter((a) => a.provider_id === providerId && a.type === 'deduction'),
      },
    });
    if (slipError) throw new Error(slipError.message);

    totals.base = round2(totals.base + base);
    totals.commission = round2(totals.commission + commission);
    totals.bonuses = round2(totals.bonuses + adjustment.bonuses);
    totals.deductions = round2(totals.deductions + adjustment.deductions);
    totals.advances = round2(totals.advances + advance.total);
    totals.net = round2(totals.net + net);
  }

  // 7) Persist the totals (allowed while draft — enforced by the DB guard).
  const { error: totalsError } = await supabaseAdmin
    .from('payroll_periods')
    .update({
      total_base: totals.base,
      total_commission: totals.commission,
      total_bonuses: totals.bonuses,
      total_deductions: totals.deductions,
      total_advances: totals.advances,
      total_net: totals.net,
      currency,
      updated_at: new Date().toISOString(),
    })
    .eq('id', periodId)
    .eq('clinic_id', clinicId);
  if (totalsError) throw new Error(totalsError.message);

  await writeAuditLog({
    clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.generated',
    resourceType: 'payroll_periods',
    resourceId: periodId,
    metadata: { period_month: periodMonth, payslips: breakdown.length, total_net: totals.net },
  });

  return { period_id: periodId, period_month: periodMonth, currency, breakdown, totals };
}

// ---------------------------------------------------------------------------
// Lifecycle: draft → approved → paid (cancel exits from draft/approved).
// Every transition is tenant-scoped, state-verified and audited.
// ---------------------------------------------------------------------------
async function loadPeriod(clinicId: string, periodId: string) {
  const { data, error } = await supabaseAdmin
    .from('payroll_periods')
    .select('id, clinic_id, period_month, status, currency, total_net')
    .eq('id', periodId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('PERIOD_NOT_FOUND');
  return data as {
    id: string;
    clinic_id: string;
    period_month: string;
    status: PayrollPeriodStatus;
    currency: string;
    total_net: number;
  };
}

export async function approvePayrollPeriod(input: {
  clinicId: string;
  periodId: string;
  actorUserId: string | null;
}): Promise<{ id: string; status: PayrollPeriodStatus; advances_deducted: number }> {
  const period = await loadPeriod(input.clinicId, input.periodId);
  if (period.status !== 'draft') throw new Error('PERIOD_STATE_CONFLICT');

  const { data: slips, error: slipError } = await supabaseAdmin
    .from('payslips')
    .select('id, provider_id, breakdown')
    .eq('payroll_period_id', period.id);
  if (slipError) throw new Error(slipError.message);
  if ((slips ?? []).length === 0) throw new Error('PAYROLL_PERIOD_EMPTY');

  // State transition first (the DB guard re-validates it), then money: if the
  // update matched no row we abort before touching advances.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('payroll_periods')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', period.id)
    .eq('clinic_id', input.clinicId)
    .eq('status', 'draft')
    .select('id, status')
    .single();
  if (updateError || !updated) throw new Error('PERIOD_STATE_CONFLICT');

  // Advances recovered by THIS payroll become `deducted` (history kept).
  const advanceIds = (slips ?? []).flatMap((s) => {
    const ids = (s.breakdown as { advances_ids?: string[] } | null)?.advances_ids ?? [];
    return Array.isArray(ids) ? ids : [];
  });
  let deducted = 0;
  if (advanceIds.length > 0) {
    const { error: advanceError } = await supabaseAdmin
      .from('staff_advances')
      .update({
        status: 'deducted',
        deducted_in_period_id: period.id,
        deducted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', input.clinicId)
      .in('id', advanceIds)
      .eq('status', 'pending');
    if (advanceError) throw new Error(advanceError.message);
    deducted = advanceIds.length;
  }

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.approved',
    resourceType: 'payroll_periods',
    resourceId: period.id,
    metadata: { period_month: period.period_month, payslips: (slips ?? []).length, advances_deducted: deducted },
  });

  return { id: period.id, status: 'approved', advances_deducted: deducted };
}

export async function markPayrollPaid(input: {
  clinicId: string;
  periodId: string;
  actorUserId: string | null;
}): Promise<{ id: string; status: PayrollPeriodStatus; ledger_event: string; amount: number }> {
  const period = await loadPeriod(input.clinicId, input.periodId);
  if (period.status !== 'approved') throw new Error('PERIOD_STATE_CONFLICT');

  const amount = round2(num(period.total_net));
  // The ledger CHECK requires amount > 0 — refuse a silently broken payroll.
  if (amount <= 0) throw new Error('PAYROLL_NET_NOT_POSITIVE');

  // ONE ledger row per paid period (kind `payroll_run`), keyed by the period so
  // a retry can never double-book.
  const eventKey = `payroll_run:${period.id}`;
  const { error: ledgerError } = await supabaseAdmin.from('financial_transactions').insert({
    clinic_id: input.clinicId,
    event_key: eventKey,
    event_type: 'payroll_run',
    ref_table: 'payroll_periods',
    ref_id: period.id,
    direction: 'out',
    amount,
    occurred_at: new Date().toISOString(),
    actor_user_id: input.actorUserId,
    metadata: { period_month: period.period_month, currency: period.currency },
    provider_id: null,
  });
  // Duplicate = already booked for this period → idempotent, not a failure.
  if (ledgerError && !/duplicate key|23505/i.test(ledgerError.message)) {
    logEvent(
      'payroll_ledger_insert_error',
      { clinic_id: input.clinicId, period_id: period.id, error: ledgerError.message },
      'error'
    );
    throw new Error(ledgerError.message);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('payroll_periods')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by: input.actorUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', period.id)
    .eq('clinic_id', input.clinicId)
    .eq('status', 'approved')
    .select('id, status')
    .single();
  if (updateError || !updated) throw new Error('PERIOD_STATE_CONFLICT');

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.paid',
    resourceType: 'payroll_periods',
    resourceId: period.id,
    metadata: { period_month: period.period_month, amount, ledger_event: eventKey },
  });

  return { id: period.id, status: 'paid', ledger_event: eventKey, amount };
}

export async function cancelPayrollPeriod(input: {
  clinicId: string;
  periodId: string;
  actorUserId: string | null;
  reason?: string | null;
}): Promise<{ id: string; status: PayrollPeriodStatus; advances_released: number }> {
  const period = await loadPeriod(input.clinicId, input.periodId);
  if (period.status === 'paid' || period.status === 'cancelled') throw new Error('PERIOD_STATE_CONFLICT');

  const { data: updated, error } = await supabaseAdmin
    .from('payroll_periods')
    .update({
      status: 'cancelled',
      notes: input.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', period.id)
    .eq('clinic_id', input.clinicId)
    .eq('status', period.status)
    .select('id, status')
    .single();
  if (error || !updated) throw new Error('PERIOD_STATE_CONFLICT');

  // Cancelling an approved period hands its advances back to `pending` — the
  // single reversal the DB guard allows.
  const { data: released, error: releaseError } = await supabaseAdmin
    .from('staff_advances')
    .update({
      status: 'pending',
      deducted_in_period_id: null,
      deducted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('clinic_id', input.clinicId)
    .eq('deducted_in_period_id', period.id)
    .eq('status', 'deducted')
    .select('id');
  if (releaseError) throw new Error(releaseError.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.cancelled',
    resourceType: 'payroll_periods',
    resourceId: period.id,
    metadata: {
      period_month: period.period_month,
      from_status: period.status,
      advances_released: (released ?? []).length,
    },
  });

  return { id: period.id, status: 'cancelled', advances_released: (released ?? []).length };
}

// ---------------------------------------------------------------------------
// Reads (tenant-scoped).
// ---------------------------------------------------------------------------
export async function listPayrollPeriods(
  clinicId: string,
  filters?: { status?: PayrollPeriodStatus; fromMonth?: string; toMonth?: string }
) {
  let query = supabaseAdmin
    .from('payroll_periods')
    .select('id, period_month, status, total_base, total_commission, total_bonuses, total_deductions, total_advances, total_net, currency, approved_at, paid_at, created_at')
    .eq('clinic_id', clinicId)
    .order('period_month', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.fromMonth) query = query.gte('period_month', filters.fromMonth);
  if (filters?.toMonth) query = query.lte('period_month', filters.toMonth);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPayrollPeriodDetail(clinicId: string, periodId: string) {
  const { data: period, error } = await supabaseAdmin
    .from('payroll_periods')
    .select('*')
    .eq('id', periodId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!period) throw new Error('PERIOD_NOT_FOUND');

  const { data: payslips, error: slipError } = await supabaseAdmin
    .from('payslips')
    .select('*')
    .eq('payroll_period_id', periodId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: true });
  if (slipError) throw new Error(slipError.message);

  // Attach provider names (explicit second read — keeps tenant scoping obvious).
  const providerIds = Array.from(new Set((payslips ?? []).map((s) => s.provider_id as string)));
  const names = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providers } = await supabaseAdmin
      .from('providers')
      .select('id, name, provider_type')
      .eq('clinic_id', clinicId)
      .in('id', providerIds);
    (providers ?? []).forEach((p) => names.set(p.id as string, (p.name as string) ?? ''));
  }

  const { data: adjustments } = await supabaseAdmin
    .from('payslip_adjustments')
    .select('id, provider_id, type, amount, reason, created_at')
    .eq('payroll_period_id', periodId)
    .eq('clinic_id', clinicId);

  return {
    period,
    payslips: (payslips ?? []).map((s) => ({
      ...s,
      provider_name: names.get(s.provider_id as string) ?? '',
    })),
    adjustments: adjustments ?? [],
  };
}

// ---------------------------------------------------------------------------
// Advances.
// ---------------------------------------------------------------------------
export async function listAdvances(
  clinicId: string,
  filters?: { providerId?: string; status?: 'pending' | 'deducted' | 'cancelled'; fromDate?: string; toDate?: string }
) {
  let query = supabaseAdmin
    .from('staff_advances')
    .select('id, provider_id, amount, reason, status, issued_at, deducted_in_period_id, deducted_at, notes, created_at')
    .eq('clinic_id', clinicId)
    .order('issued_at', { ascending: false });
  if (filters?.providerId) query = query.eq('provider_id', filters.providerId);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.fromDate) query = query.gte('issued_at', filters.fromDate);
  if (filters?.toDate) query = query.lte('issued_at', filters.toDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const providerIds = Array.from(new Set((data ?? []).map((a) => a.provider_id as string)));
  const names = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: providers } = await supabaseAdmin
      .from('providers')
      .select('id, name')
      .eq('clinic_id', clinicId)
      .in('id', providerIds);
    (providers ?? []).forEach((p) => names.set(p.id as string, (p.name as string) ?? ''));
  }
  return (data ?? []).map((a) => ({ ...a, provider_name: names.get(a.provider_id as string) ?? '' }));
}

export async function createAdvance(input: {
  clinicId: string;
  providerId: string;
  amount: number;
  reason?: string | null;
  issuedAt?: string | null;
  notes?: string | null;
  actorUserId: string | null;
}) {
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new Error('ADVANCE_AMOUNT_INVALID');

  // The payee must be an ACTIVE provider of THIS clinic (tenant guard; the
  // composite FK enforces the same rule in the DB).
  const { data: provider } = await supabaseAdmin
    .from('providers')
    .select('id, name, deleted_at')
    .eq('id', input.providerId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (!provider) throw new Error('PROVIDER_NOT_FOUND');
  if (provider.deleted_at) throw new Error('PROVIDER_INACTIVE');

  const { data, error } = await supabaseAdmin
    .from('staff_advances')
    .insert({
      clinic_id: input.clinicId,
      provider_id: input.providerId,
      amount,
      reason: input.reason ?? null,
      status: 'pending',
      issued_at: input.issuedAt ?? new Date().toISOString().slice(0, 10),
      notes: input.notes ?? null,
      created_by: input.actorUserId,
    })
    .select('id, provider_id, amount, status, issued_at')
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.advance.created',
    resourceType: 'staff_advances',
    resourceId: data.id,
    metadata: { provider_id: input.providerId, amount },
  });
  return data;
}

/** Cancel = status change, never a delete (history is kept, like the ledger). */
export async function cancelAdvance(input: {
  clinicId: string;
  advanceId: string;
  actorUserId: string | null;
}) {
  const { data: advance, error } = await supabaseAdmin
    .from('staff_advances')
    .select('id, status, amount, provider_id')
    .eq('id', input.advanceId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!advance) throw new Error('ADVANCE_NOT_FOUND');
  if (advance.status !== 'pending') throw new Error('ADVANCE_NOT_PENDING');

  const { error: updateError } = await supabaseAdmin
    .from('staff_advances')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', input.advanceId)
    .eq('clinic_id', input.clinicId)
    .eq('status', 'pending');
  if (updateError) throw new Error(updateError.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.advance.cancelled',
    resourceType: 'staff_advances',
    resourceId: input.advanceId,
    metadata: { provider_id: advance.provider_id, amount: advance.amount },
  });
  return { id: input.advanceId, status: 'cancelled' as const };
}

// ---------------------------------------------------------------------------
// Adjustments (bonuses / deductions) — only while the period is a DRAFT.
// ---------------------------------------------------------------------------
export async function addPayslipAdjustment(input: {
  clinicId: string;
  periodId: string;
  providerId: string;
  type: 'bonus' | 'deduction';
  amount: number;
  reason: string;
  actorUserId: string | null;
}) {
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new Error('ADJUSTMENT_AMOUNT_INVALID');
  if (!input.reason?.trim()) throw new Error('ADJUSTMENT_REASON_REQUIRED');
  if (input.type !== 'bonus' && input.type !== 'deduction') throw new Error('ADJUSTMENT_TYPE_INVALID');

  const period = await loadPeriod(input.clinicId, input.periodId);
  if (period.status !== 'draft') throw new Error('PERIOD_STATE_CONFLICT');

  // The payslip must already exist → the adjustment belongs to a generated run.
  const { data: payslip } = await supabaseAdmin
    .from('payslips')
    .select('id')
    .eq('payroll_period_id', period.id)
    .eq('clinic_id', input.clinicId)
    .eq('provider_id', input.providerId)
    .maybeSingle();
  if (!payslip) throw new Error('PAYSLIP_NOT_FOUND');

  const { data, error } = await supabaseAdmin
    .from('payslip_adjustments')
    .insert({
      payroll_period_id: period.id,
      provider_id: input.providerId,
      clinic_id: input.clinicId,
      type: input.type,
      amount,
      reason: input.reason.trim(),
      created_by: input.actorUserId,
    })
    .select('id, provider_id, type, amount, reason')
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.adjustment.created',
    resourceType: 'payslip_adjustments',
    resourceId: data.id,
    metadata: { period_id: period.id, provider_id: input.providerId, type: input.type, amount },
  });
  return data;
}

export async function deletePayslipAdjustment(input: {
  clinicId: string;
  adjustmentId: string;
  actorUserId: string | null;
}) {
  const { data: adjustment, error } = await supabaseAdmin
    .from('payslip_adjustments')
    .select('id, payroll_period_id, provider_id, type, amount')
    .eq('id', input.adjustmentId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!adjustment) throw new Error('ADJUSTMENT_NOT_FOUND');

  // Only a draft period may lose an adjustment (approved runs are frozen).
  const period = await loadPeriod(input.clinicId, adjustment.payroll_period_id as string);
  if (period.status !== 'draft') throw new Error('PERIOD_STATE_CONFLICT');

  const { error: deleteError } = await supabaseAdmin
    .from('payslip_adjustments')
    .delete()
    .eq('id', input.adjustmentId)
    .eq('clinic_id', input.clinicId);
  if (deleteError) throw new Error(deleteError.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.adjustment.deleted',
    resourceType: 'payslip_adjustments',
    resourceId: input.adjustmentId,
    metadata: { period_id: period.id, provider_id: adjustment.provider_id, type: adjustment.type },
  });
  return { id: input.adjustmentId, deleted: true as const };
}
