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

/** One advance installment taken by a payslip (Phase 2). */
export type AdvanceDeductionLine = {
  advance_id: string;
  amount: number;
  /** 1-based: which installment this deduction is. */
  installment_number: number;
  /** Total installments of the advance (1 = single-shot). */
  installments: number;
};

export type PayrollAuditAction =
  | 'generated'
  | 'approved'
  | 'paid'
  | 'cancelled'
  | 'unlocked';

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
// Payroll audit trail (20261016). Separate from the generic audit log: this one
// is period-scoped and is what the payroll UI reads back, so a pay dispute can
// be reconstructed verbatim. A failed audit write never blocks payroll — the
// generic audit log already has the same event.
// ---------------------------------------------------------------------------
export async function writePayrollAudit(input: {
  clinicId: string;
  periodId: string | null;
  actorUserId: string | null;
  action: PayrollAuditAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('payroll_audit_log').insert({
    clinic_id: input.clinicId,
    payroll_period_id: input.periodId,
    actor_user_id: input.actorUserId,
    action: input.action,
    details: input.details ?? {},
  });
  if (error) {
    logEvent(
      'payroll_audit_write_error',
      { clinic_id: input.clinicId, period_id: input.periodId, action: input.action, error: error.message },
      'error'
    );
  }
}

export async function listPayrollAudit(
  clinicId: string,
  options?: { periodId?: string; limit?: number }
) {
  let query = supabaseAdmin
    .from('payroll_audit_log')
    .select('id, payroll_period_id, action, actor_user_id, details, created_at')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 100, 1), 500));
  if (options?.periodId) query = query.eq('payroll_period_id', options.periodId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean))) as string[];
  const actors = new Map<string, string | null>();
  for (const id of actorIds) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
      actors.set(id, userData?.user?.email ?? null);
    } catch {
      actors.set(id, null);
    }
  }
  return (data ?? []).map((row) => ({ ...row, actor_email: actors.get(row.actor_user_id as string) ?? null }));
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

  // 4) Advances — money already handed to the person.
  //    Phase 2: an installment advance contributes exactly ONE monthly
  //    installment (never the whole principal) until it is fully repaid, and
  //    the lines are stored in the payslip breakdown so approval can record the
  //    same amounts in staff_advance_deductions without recomputing anything.
  const advancesByProvider = new Map<
    string,
    { total: number; ids: string[]; details: AdvanceDeductionLine[] }
  >();
  const { data: advances, error: advancesError } = await supabaseAdmin
    .from('staff_advances')
    .select('id, provider_id, amount, installment_count, installment_amount, months_paid')
    .eq('clinic_id', clinicId)
    .eq('status', 'pending');
  if (advancesError) throw new Error(advancesError.message);
  (advances ?? []).forEach((a) => {
    const totalInstallments = Math.max(1, Math.trunc(num(a.installment_count)) || 1);
    const monthsPaid = Math.max(0, Math.trunc(num(a.months_paid)));
    if (monthsPaid >= totalInstallments) return; // fully repaid — nothing to take
    const installment = a.installment_amount != null
      ? num(a.installment_amount)
      : round2(num(a.amount) / totalInstallments);
    if (!(installment > 0)) return;

    const bucket = advancesByProvider.get(a.provider_id as string) ?? { total: 0, ids: [], details: [] };
    bucket.total = round2(bucket.total + installment);
    bucket.ids.push(a.id as string);
    bucket.details.push({
      advance_id: a.id as string,
      amount: installment,
      installment_number: monthsPaid + 1,
      installments: totalInstallments,
    });
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
    const advance = advancesByProvider.get(providerId) ?? { total: 0, ids: [], details: [] };
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
        advance_details: advance.details,
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

  await writePayrollAudit({
    clinicId,
    periodId,
    actorUserId: input.actorUserId,
    action: 'generated',
    details: { period_month: periodMonth, payslips: breakdown.length, total_net: totals.net, currency },
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

  // Advances recovered by THIS payroll: one deduction row per installment and a
  // counter bump. A multi-installment advance stays `pending` until its LAST
  // installment, so the next payroll keeps taking the monthly amount.
  // Payslips generated before Phase 2 carry only `advances_ids` — those keep the
  // Phase 1 single-shot behaviour so an in-flight draft still approves correctly.
  const advanceLines: AdvanceDeductionLine[] = (slips ?? []).flatMap((s) => {
    const lines = (s.breakdown as { advance_details?: AdvanceDeductionLine[] } | null)?.advance_details ?? [];
    return Array.isArray(lines) ? lines : [];
  });
  const legacyAdvanceIds = (slips ?? []).flatMap((s) => {
    const ids = (s.breakdown as { advances_ids?: string[] } | null)?.advances_ids ?? [];
    return Array.isArray(ids) ? ids : [];
  });

  let deducted = 0;

  for (const line of advanceLines) {
    const amount = round2(num(line.amount));
    if (!(amount > 0)) continue;

    // (a) Record what was actually taken — one row per advance per period.
    const { error: deductionError } = await supabaseAdmin
      .from('staff_advance_deductions')
      .insert({
        advance_id: line.advance_id,
        payroll_period_id: period.id,
        clinic_id: input.clinicId,
        amount,
      });
    // Duplicate = this period already took this installment (approve retried).
    if (deductionError && !/duplicate key|23505/i.test(deductionError.message)) {
      throw new Error(deductionError.message);
    }

    // (b) Advance the installment counter; completed advances become history.
    const { data: advance } = await supabaseAdmin
      .from('staff_advances')
      .select('id, installment_count, months_paid')
      .eq('id', line.advance_id)
      .eq('clinic_id', input.clinicId)
      .maybeSingle();
    if (!advance) continue;

    const totalInstallments = Math.max(1, Math.trunc(num(advance.installment_count)) || 1);
    const monthsPaid = Math.min(totalInstallments, Math.max(0, Math.trunc(num(advance.months_paid))) + 1);
    const isComplete = monthsPaid >= totalInstallments;

    const { error: advanceError } = await supabaseAdmin
      .from('staff_advances')
      .update({
        months_paid: monthsPaid,
        status: isComplete ? 'deducted' : 'pending',
        deducted_in_period_id: isComplete ? period.id : null,
        deducted_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', line.advance_id)
      .eq('clinic_id', input.clinicId);
    if (advanceError) throw new Error(advanceError.message);
    deducted += 1;
  }

  // Legacy (Phase 1) payslips: full principal deducted in one shot.
  if (advanceLines.length === 0 && legacyAdvanceIds.length > 0) {
    const { error: advanceError } = await supabaseAdmin
      .from('staff_advances')
      .update({
        status: 'deducted',
        deducted_in_period_id: period.id,
        deducted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', input.clinicId)
      .in('id', legacyAdvanceIds)
      .eq('status', 'pending');
    if (advanceError) throw new Error(advanceError.message);
    deducted = legacyAdvanceIds.length;
  }

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.approved',
    resourceType: 'payroll_periods',
    resourceId: period.id,
    metadata: { period_month: period.period_month, payslips: (slips ?? []).length, advances_deducted: deducted },
  });

  await writePayrollAudit({
    clinicId: input.clinicId,
    periodId: period.id,
    actorUserId: input.actorUserId,
    action: 'approved',
    details: {
      period_month: period.period_month,
      payslips: (slips ?? []).length,
      advances_deducted: deducted,
      installments: advanceLines.length,
    },
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

  await writePayrollAudit({
    clinicId: input.clinicId,
    periodId: period.id,
    actorUserId: input.actorUserId,
    action: 'paid',
    details: { period_month: period.period_month, amount, ledger_event: eventKey },
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

  // Phase 2 — reverse THIS period's advance installments BEFORE the period
  // leaves a writable state (the deductions guard freezes them once paid).
  const { data: deductionRows, error: deductionReadError } = await supabaseAdmin
    .from('staff_advance_deductions')
    .select('id, advance_id, amount')
    .eq('payroll_period_id', period.id)
    .eq('clinic_id', input.clinicId);
  if (deductionReadError) throw new Error(deductionReadError.message);

  if ((deductionRows ?? []).length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('staff_advance_deductions')
      .delete()
      .eq('payroll_period_id', period.id)
      .eq('clinic_id', input.clinicId);
    if (deleteError) throw new Error(deleteError.message);

    // Give the installment back: decrement the counter and reopen a completed
    // advance (the ONLY reversal the advances guard allows).
    for (const row of deductionRows ?? []) {
      const { data: advance } = await supabaseAdmin
        .from('staff_advances')
        .select('id, installment_count, months_paid, status, deducted_in_period_id')
        .eq('id', row.advance_id as string)
        .eq('clinic_id', input.clinicId)
        .maybeSingle();
      if (!advance) continue;

      const totalInstallments = Math.max(1, Math.trunc(num(advance.installment_count)) || 1);
      const monthsPaid = Math.max(0, Math.trunc(num(advance.months_paid)) - 1);
      const wasCompleted = advance.status === 'deducted' && advance.deducted_in_period_id === period.id;

      const { error: advanceError } = await supabaseAdmin
        .from('staff_advances')
        .update({
          months_paid: monthsPaid,
          status: 'pending',
          // Only a completion THIS period may be undone; otherwise the advance
          // keeps pointing at the period that actually completed it.
          deducted_in_period_id: wasCompleted ? null : advance.deducted_in_period_id,
          deducted_at: wasCompleted ? null : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.advance_id as string)
        .eq('clinic_id', input.clinicId);
      if (advanceError) throw new Error(advanceError.message);
      // monthsPaid is derived, kept only for readability of the trail.
      void totalInstallments;
    }
  }

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

  await writePayrollAudit({
    clinicId: input.clinicId,
    periodId: period.id,
    actorUserId: input.actorUserId,
    action: 'cancelled',
    details: {
      period_month: period.period_month,
      from_status: period.status,
      advances_released: (released ?? []).length,
      installments_reversed: (deductionRows ?? []).length,
      reason: input.reason ?? null,
    },
  });

  return { id: period.id, status: 'cancelled', advances_released: (released ?? []).length };
}

/**
 * Unlock (20261016) — owner-only escape hatch that returns a finalized period to
 * draft so a corrected payroll can be regenerated. The reason is mandatory and
 * every unlock is counted + audited; the DB guard re-validates that a reason
 * exists and that totals only change on the unlocking statement itself.
 *
 * NOTE: unlocking does NOT touch money. If the period was already PAID, the
 * `payroll_run` ledger row stays (append-only ledger) — the next `pay` of the
 * regenerated period is keyed by period id, so it cannot double-book either.
 */
export async function unlockPayrollPeriod(input: {
  clinicId: string;
  periodId: string;
  actorUserId: string;
  reason: string;
}): Promise<{ id: string; status: PayrollPeriodStatus; unlock_count: number }> {
  const reason = (input.reason ?? '').trim();
  if (reason.length < 5) throw new Error('UNLOCK_REASON_TOO_SHORT');

  const { data: period, error } = await supabaseAdmin
    .from('payroll_periods')
    .select('id, clinic_id, period_month, status, unlock_count')
    .eq('id', input.periodId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!period) throw new Error('PERIOD_NOT_FOUND');
  if (!['approved', 'paid'].includes(period.status as string)) {
    throw new Error('CANNOT_UNLOCK_THIS_STATUS');
  }

  const unlockCount = Math.max(0, Math.trunc(num(period.unlock_count))) + 1;
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('payroll_periods')
    .update({
      status: 'draft',
      unlocked_at: new Date().toISOString(),
      unlocked_by: input.actorUserId,
      unlock_reason: reason,
      unlock_count: unlockCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', period.id)
    .eq('clinic_id', input.clinicId)
    .eq('status', period.status)
    .select('id, status, unlock_count')
    .single();
  if (updateError || !updated) throw new Error('PERIOD_STATE_CONFLICT');

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.period.unlocked',
    resourceType: 'payroll_periods',
    resourceId: period.id,
    metadata: { period_month: period.period_month, from_status: period.status, reason, unlock_count: unlockCount },
  });

  await writePayrollAudit({
    clinicId: input.clinicId,
    periodId: period.id,
    actorUserId: input.actorUserId,
    action: 'unlocked',
    details: { period_month: period.period_month, from_status: period.status, reason, unlock_count: unlockCount },
  });

  // Advanced picks are re-derived on the next generate — nothing is cached here.

  return { id: period.id, status: 'draft', unlock_count: unlockCount };
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
    .select('id, provider_id, amount, reason, status, issued_at, deducted_in_period_id, deducted_at, notes, created_at, installment_count, installment_amount, months_paid')
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
  /** 1..12 — how many monthly payrolls the advance is recovered over. */
  installmentCount?: number | null;
  actorUserId: string | null;
}) {
  const amount = round2(num(input.amount));
  if (!(amount > 0)) throw new Error('ADVANCE_AMOUNT_INVALID');

  const installmentCount = input.installmentCount == null
    ? 1
    : Math.trunc(num(input.installmentCount));
  if (!Number.isFinite(installmentCount) || installmentCount < 1 || installmentCount > 12) {
    throw new Error('ADVANCE_INSTALLMENTS_INVALID');
  }

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

  // The per-installment amount is STORED, never re-derived at deduction time:
  // editing the count later must not silently change what was agreed.
  const installmentAmount = round2(amount / installmentCount);

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
      installment_count: installmentCount,
      installment_amount: installmentAmount,
      months_paid: 0,
      created_by: input.actorUserId,
    })
    .select('id, provider_id, amount, status, issued_at, installment_count, installment_amount, months_paid')
    .single();
  if (error) throw new Error(error.message);

  await writeAuditLog({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: 'payroll.advance.created',
    resourceType: 'staff_advances',
    resourceId: data.id,
    metadata: {
      provider_id: input.providerId,
      amount,
      installment_count: installmentCount,
      installment_amount: installmentAmount,
    },
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

// ---------------------------------------------------------------------------
// Self-service (20261016). The employee ↔ provider link is providers.user_id,
// resolved from the caller's own auth id — a member can never read another
// person's pay through these paths, whatever the request body says.
// ---------------------------------------------------------------------------
async function resolveSelfProviderId(clinicId: string, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listSelfPayslips(input: {
  clinicId: string;
  userId: string;
  limit?: number;
}) {
  const providerId = await resolveSelfProviderId(input.clinicId, input.userId);
  if (!providerId) return { provider_id: null, payslips: [], advances: [] };

  const { data: payslips, error } = await supabaseAdmin
    .from('payslips')
    .select('id, payroll_period_id, provider_id, base_amount, commission_amount, bonuses_amount, deductions_amount, advances_amount, revenue_attributed, net_amount, currency, breakdown, created_at')
    .eq('clinic_id', input.clinicId)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 36, 1), 120));
  if (error) throw new Error(error.message);

  // A draft period is an internal working document — the employee only ever
  // sees pay that the clinic has approved or paid.
  const periodIds = Array.from(new Set((payslips ?? []).map((p) => p.payroll_period_id as string)));
  const periodMeta = new Map<string, { period_month: string; status: string; paid_at: string | null }>();
  if (periodIds.length > 0) {
    const { data: periods } = await supabaseAdmin
      .from('payroll_periods')
      .select('id, period_month, status, paid_at')
      .eq('clinic_id', input.clinicId)
      .in('id', periodIds);
    (periods ?? []).forEach((p) =>
      periodMeta.set(p.id as string, {
        period_month: p.period_month as string,
        status: p.status as string,
        paid_at: (p.paid_at as string | null) ?? null,
      })
    );
  }

  const visible = (payslips ?? [])
    .filter((p) => {
      const meta = periodMeta.get(p.payroll_period_id as string);
      return meta && (meta.status === 'approved' || meta.status === 'paid');
    })
    .map((p) => {
      const meta = periodMeta.get(p.payroll_period_id as string);
      return {
        ...p,
        period_month: meta?.period_month ?? null,
        period_status: meta?.status ?? null,
        paid_at: meta?.paid_at ?? null,
      };
    });

  const { data: advances, error: advanceError } = await supabaseAdmin
    .from('staff_advances')
    .select('id, amount, reason, status, issued_at, installment_count, installment_amount, months_paid')
    .eq('clinic_id', input.clinicId)
    .eq('provider_id', providerId)
    .order('issued_at', { ascending: false });
  if (advanceError) throw new Error(advanceError.message);

  return { provider_id: providerId, payslips: visible, advances: advances ?? [] };
}

/** One payslip — readable by an admin OR by the provider it belongs to. */
export async function getPayslipDetail(input: {
  clinicId: string;
  payslipId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const { data: payslip, error } = await supabaseAdmin
    .from('payslips')
    .select('*')
    .eq('id', input.payslipId)
    .eq('clinic_id', input.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payslip) throw new Error('PAYSLIP_NOT_FOUND');

  const [{ data: period }, { data: provider }] = await Promise.all([
    supabaseAdmin
      .from('payroll_periods')
      .select('id, period_month, status, approved_at, paid_at, unlock_count, unlock_reason, unlocked_at')
      .eq('id', payslip.payroll_period_id as string)
      .eq('clinic_id', input.clinicId)
      .maybeSingle(),
    supabaseAdmin
      .from('providers')
      .select('id, name, title, provider_type, email')
      .eq('id', payslip.provider_id as string)
      .eq('clinic_id', input.clinicId)
      .maybeSingle(),
  ]);

  if (!input.isAdmin) {
    const providerId = await resolveSelfProviderId(input.clinicId, input.userId);
    // Ownership AND publication are both required: a draft run is internal.
    if (!providerId || providerId !== (payslip.provider_id as string)) throw new Error('FORBIDDEN');
    if (!['approved', 'paid'].includes((period?.status as string) ?? '')) throw new Error('FORBIDDEN');
  }

  // Which installments of which advances were taken in THIS period, so the
  // payslip can explain the advance line instead of showing a bare number.
  const advanceIds = ((payslip.breakdown as { advance_details?: Array<{ advance_id: string }> } | null)
    ?.advance_details ?? []).map((line) => line.advance_id);

  let deductions: Array<Record<string, unknown>> = [];
  if (advanceIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('staff_advance_deductions')
      .select('id, advance_id, amount, deducted_at')
      .eq('payroll_period_id', payslip.payroll_period_id as string)
      .eq('clinic_id', input.clinicId)
      .in('advance_id', advanceIds);
    deductions = data ?? [];
  }

  return {
    ...payslip,
    period_month: (period?.period_month as string | null) ?? null,
    period_status: (period?.status as string | null) ?? null,
    period_approved_at: (period?.approved_at as string | null) ?? null,
    period_paid_at: (period?.paid_at as string | null) ?? null,
    provider_name: (provider?.name as string | null) ?? null,
    provider_title: (provider?.title as string | null) ?? null,
    advance_deductions: deductions,
  };
}


