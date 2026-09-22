import { describe, it, expect, vi, beforeEach } from 'vitest';

// Payroll Engine Phase 1 — generation math, lifecycle, tenant scoping, RBAC.

const mockAuth = vi.hoisted(() => ({ authorizeClinicRequest: vi.fn() }));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mockAuth.authorizeClinicRequest,
  roleDenied: (auth: any, roles: readonly string[]) => {
    if (!auth?.authorized) return { authorized: false, status: (auth?.status ?? 401) as 401 | 403 };
    if (!roles.includes(auth.role ?? '')) return { authorized: false, status: 403 as const };
    return null;
  },
  FINANCE_ADMIN_ROLES: ['owner', 'accountant'],
  FINANCE_READ_ROLES: ['owner', 'accountant', 'manager', 'receptionist'],
}));

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const auditCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/lib/services/auditService', () => ({
  writeAuditLog: vi.fn(async (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
  }),
}));

// ---------------------------------------------------------------------------
// Table/op driven supabaseAdmin mock: `respond['<table>.<op>']` is the answer.
// ---------------------------------------------------------------------------
const respond: Record<string, { data?: unknown; error?: unknown }> = {};
const writes: Array<{ table: string; payload: unknown }> = [];

function makeBuilder(table: string) {
  const b: Record<string, any> = {};
  let op = 'select';
  const answer = () => respond[`${table}.${op}`] ?? { data: [], error: null };
  b.select = vi.fn(() => b);
  b.insert = vi.fn((payload: unknown) => { op = 'insert'; writes.push({ table, payload }); return b; });
  b.update = vi.fn((payload: unknown) => { op = 'update'; writes.push({ table, payload }); return b; });
  b.delete = vi.fn(() => { op = 'delete'; return b; });
  for (const m of ['eq', 'in', 'is', 'gte', 'lte', 'order', 'limit', 'not']) b[m] = vi.fn(() => b);
  b.single = vi.fn(async () => answer());
  b.maybeSingle = vi.fn(async () => answer());
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(answer()));
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn((table: string) => makeBuilder(table)) },
}));

import {
  round2,
  monthStart,
  generatePayrollPeriod,
  approvePayrollPeriod,
  markPayrollPaid,
  cancelPayrollPeriod,
} from '@/lib/services/payroll-engine';
import { POST as postPeriod, GET as getPeriods } from '@/app/api/clinic/payroll/periods/route';
import { PATCH as patchPeriod } from '@/app/api/clinic/payroll/periods/[periodId]/route';
import { POST as postAdvance } from '@/app/api/clinic/payroll/advances/route';
import { POST as postAdjustment } from '@/app/api/clinic/payroll/adjustments/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const OTHER_CLINIC = '99999999-9999-9999-9999-999999999999';
const PERIOD = 'aaaaaaaa-1111-1111-1111-111111111111';
const PROVIDER = 'bbbbbbbb-1111-1111-1111-111111111111';

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}
function jsonBody(data: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}

beforeEach(() => {
  for (const key of Object.keys(respond)) delete respond[key];
  writes.length = 0;
  auditCalls.length = 0;
  mockAuth.authorizeClinicRequest.mockReset();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u1' }, role: 'owner' });
});

describe('helpers', () => {
  it('round2 is exact on float noise', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1234.567)).toBe(1234.57);
  });

  it('monthStart builds the clinic-local month key used by provider_revenue', () => {
    expect(monthStart('2026-09')).toBe('2026-09-01');
  });
});


function primeGeneration(opts?: {
  model?: string;
  percent?: number | null;
  fixed?: number | null;
  revenue?: number;
  advances?: number;
  adjustments?: Array<{ provider_id: string; type: string; amount: number }>;
  periodStatus?: string | null;
  providerDeleted?: boolean;
}) {
  const model = opts?.model ?? 'hybrid';
  respond['clinic_settings.select'] = { data: { currency: 'ILS' }, error: null };
  respond['payroll_periods.select'] = {
    data: opts?.periodStatus === null ? null : { id: PERIOD, status: opts?.periodStatus ?? 'draft' },
    error: null,
  };
  respond['payroll_periods.insert'] = { data: { id: PERIOD }, error: null };
  respond['clinic_provider_compensations.select'] = {
    data: [{
      provider_id: PROVIDER,
      model,
      commission_percent: opts?.percent === undefined ? 10 : opts.percent,
      fixed_monthly_amount: opts?.fixed === undefined ? 3000 : opts.fixed,
    }],
    error: null,
  };
  respond['providers.select'] = {
    data: [{ id: PROVIDER, name: 'د. تجريبي', deleted_at: opts?.providerDeleted ? '2026-01-01' : null }],
    error: null,
  };
  respond['provider_revenue.select'] = {
    data: opts?.revenue === undefined ? [] : [{ provider_id: PROVIDER, issued_revenue: opts.revenue }],
    error: null,
  };
  respond['staff_advances.select'] = {
    data: opts?.advances ? [{ id: 'adv-1', provider_id: PROVIDER, amount: opts.advances }] : [],
    error: null,
  };
  respond['payslip_adjustments.select'] = { data: opts?.adjustments ?? [], error: null };
  respond['payslips.insert'] = { data: null, error: null };
  respond['payroll_periods.update'] = { data: null, error: null };
}

describe('generatePayrollPeriod', () => {
  it('hybrid: fixed base + commission on the DERIVED revenue, minus advances', async () => {
    primeGeneration({ model: 'hybrid', percent: 10, fixed: 3000, revenue: 20000, advances: 500 });
    const result = await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });

    expect(result.breakdown).toHaveLength(1);
    const slip = result.breakdown[0];
    expect(slip.base_amount).toBe(3000);
    expect(slip.commission_amount).toBe(2000); // 10% of 20000
    expect(slip.advances_amount).toBe(500);
    expect(slip.net_amount).toBe(4500); // 3000 + 2000 − 500
    expect(result.totals.net).toBe(4500);
    expect(result.currency).toBe('ILS');
  });

  it('commission model ignores the fixed amount and reads provider_revenue', async () => {
    primeGeneration({ model: 'commission_percentage', percent: 15, fixed: 9999, revenue: 1000 });
    const result = await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });
    expect(result.breakdown[0].base_amount).toBe(0);
    expect(result.breakdown[0].commission_amount).toBe(150);
  });

  it('fixed_monthly ignores revenue entirely', async () => {
    primeGeneration({ model: 'fixed_monthly', percent: 50, fixed: 4200, revenue: 99999 });
    const result = await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });
    expect(result.breakdown[0].commission_amount).toBe(0);
    expect(result.breakdown[0].net_amount).toBe(4200);
  });

  it('folds bonuses and deductions from payslip_adjustments into the slip', async () => {
    primeGeneration({
      model: 'fixed_monthly',
      fixed: 1000,
      adjustments: [
        { provider_id: PROVIDER, type: 'bonus', amount: 250 },
        { provider_id: PROVIDER, type: 'deduction', amount: 100 },
      ],
    });
    const result = await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });
    const slip = result.breakdown[0];
    expect(slip.bonuses_amount).toBe(250);
    expect(slip.deductions_amount).toBe(100);
    expect(slip.net_amount).toBe(1150); // 1000 + 250 − 100
  });

  it('stores clinic_id, currency and the attributed revenue on the payslip', async () => {
    primeGeneration({ revenue: 500 });
    await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });
    const slipWrite = writes.find((w) => w.table === 'payslips');
    expect(slipWrite).toBeTruthy();
    const payload = slipWrite!.payload as any;
    expect(payload.clinic_id).toBe(CLINIC);
    expect(payload.currency).toBe('ILS');
    expect(payload.breakdown.revenue_attributed).toBe(500);
    expect(payload.breakdown.advances_ids).toEqual([]);
  });

  it('refuses an invalid month before touching the DB', async () => {
    await expect(
      generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-13', actorUserId: 'u1' })
    ).rejects.toThrow('PAYROLL_PERIOD_MONTH_INVALID');
    expect(writes).toHaveLength(0);
  });

  it('refuses to regenerate a finalized period', async () => {
    primeGeneration({ periodStatus: 'approved' });
    await expect(
      generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' })
    ).rejects.toThrow('PERIOD_ALREADY_FINALIZED');
  });

  it('skips soft-deleted providers (never pays them)', async () => {
    primeGeneration({ providerDeleted: true });
    const result = await generatePayrollPeriod({ clinicId: CLINIC, periodMonth: '2026-09', actorUserId: 'u1' });
    expect(result.breakdown).toHaveLength(0);
    expect(writes.filter((w) => w.table === 'payslips')).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('approve: draft → approved, marks the advances deducted', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'draft', currency: 'ILS', total_net: 100 }, error: null };
    respond['payslips.select'] = { data: [{ id: 's1', provider_id: PROVIDER, breakdown: { advances_ids: ['adv-1'] } }], error: null };
    respond['payroll_periods.update'] = { data: { id: PERIOD, status: 'approved' }, error: null };
    respond['staff_advances.update'] = { data: { id: 'adv-1' }, error: null };

    const result = await approvePayrollPeriod({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' });
    expect(result.status).toBe('approved');
    expect(result.advances_deducted).toBe(1);
    expect(auditCalls.some((a) => a.action === 'payroll.period.approved')).toBe(true);
  });

  it('approve refuses an empty period', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'draft', currency: 'ILS', total_net: 0 }, error: null };
    respond['payslips.select'] = { data: [], error: null };
    await expect(approvePayrollPeriod({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' })).rejects.toThrow('PAYROLL_PERIOD_EMPTY');
  });

  it('approve refuses a period that is not a draft', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'paid', currency: 'ILS', total_net: 10 }, error: null };
    await expect(approvePayrollPeriod({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' })).rejects.toThrow('PERIOD_STATE_CONFLICT');
  });

  it('markPaid writes ONE payroll_run ledger row keyed by the period', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', currency: 'ILS', total_net: 4500 }, error: null };
    respond['financial_transactions.insert'] = { data: null, error: null };
    respond['payroll_periods.update'] = { data: { id: PERIOD, status: 'paid' }, error: null };

    const result = await markPayrollPaid({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' });
    expect(result.amount).toBe(4500);
    const ledger = writes.find((w) => w.table === 'financial_transactions');
    expect(ledger).toBeTruthy();
    const payload = ledger!.payload as any;
    expect(payload.event_type).toBe('payroll_run');
    expect(payload.direction).toBe('out');
    expect(payload.event_key).toBe(`payroll_run:${PERIOD}`);
    expect(payload.ref_table).toBe('payroll_periods');
    // Reports protection: payroll must never be booked as an expense kind.
    expect(payload.event_type).not.toBe('expense_recorded');
  });

  it('markPaid refuses a non-positive net (ledger CHECK amount > 0)', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', currency: 'ILS', total_net: 0 }, error: null };
    await expect(markPayrollPaid({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' })).rejects.toThrow('PAYROLL_NET_NOT_POSITIVE');
    expect(writes.filter((w) => w.table === 'financial_transactions')).toHaveLength(0);
  });

  it('markPaid tolerates a duplicate ledger row (idempotent retry)', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', currency: 'ILS', total_net: 100 }, error: null };
    respond['financial_transactions.insert'] = { data: null, error: { message: 'duplicate key value violates unique constraint' } };
    respond['payroll_periods.update'] = { data: { id: PERIOD, status: 'paid' }, error: null };
    const result = await markPayrollPaid({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' });
    expect(result.status).toBe('paid');
  });

  it('cancel releases the advances of an approved period back to pending', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', currency: 'ILS', total_net: 100 }, error: null };
    respond['payroll_periods.update'] = { data: { id: PERIOD, status: 'cancelled' }, error: null };
    respond['staff_advances.update'] = { data: [{ id: 'adv-1' }], error: null };
    const result = await cancelPayrollPeriod({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' });
    expect(result.status).toBe('cancelled');
    expect(result.advances_released).toBe(1);
  });

  it('cancel refuses a paid period (terminal state)', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'paid', currency: 'ILS', total_net: 100 }, error: null };
    await expect(cancelPayrollPeriod({ clinicId: CLINIC, periodId: PERIOD, actorUserId: 'u1' })).rejects.toThrow('PERIOD_STATE_CONFLICT');
  });

  it('period lookups are tenant-scoped (another clinic never sees the period)', async () => {
    respond['payroll_periods.select'] = { data: null, error: null };
    await expect(
      markPayrollPaid({ clinicId: OTHER_CLINIC, periodId: PERIOD, actorUserId: 'u1' })
    ).rejects.toThrow('PERIOD_NOT_FOUND');
  });
});


describe('APIs — FINANCE RBAC + error mapping', () => {
  it('POST /periods is 403 for a non-finance role', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u1' }, role: 'receptionist' });
    const res = await postPeriod(req('/api/clinic/payroll/periods', jsonBody({ clinic_id: CLINIC, period_month: '2026-09' })));
    expect(res.status).toBe(403);
  });

  it('POST /periods returns 400 for a malformed month', async () => {
    respond['payroll_periods.select'] = { data: null, error: null };
    const res = await postPeriod(req('/api/clinic/payroll/periods', jsonBody({ clinic_id: CLINIC, period_month: 'septembre' })));
    expect(res.status).toBe(400);
  });

  it('POST /periods is 409 when the period is already finalized', async () => {
    respond['clinic_settings.select'] = { data: { currency: 'ILS' }, error: null };
    respond['payroll_periods.select'] = { data: { id: PERIOD, status: 'paid' }, error: null };
    const res = await postPeriod(req('/api/clinic/payroll/periods', jsonBody({ clinic_id: CLINIC, period_month: '2026-09' })));
    expect(res.status).toBe(409);
  });

  it('GET /periods requires clinic_id and returns the tenant list', async () => {
    const bad = await getPeriods(req('/api/clinic/payroll/periods'));
    expect(bad.status).toBe(400);

    respond['payroll_periods.select'] = { data: [{ id: PERIOD, status: 'draft' }], error: null };
    const ok = await getPeriods(req(`/api/clinic/payroll/periods?clinic_id=${CLINIC}`));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toHaveLength(1);
  });

  it('PATCH /periods rejects an unknown action', async () => {
    const res = await patchPeriod(
      req(`/api/clinic/payroll/periods/${PERIOD}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clinic_id: CLINIC, action: 'delete' }),
      }),
      { params: Promise.resolve({ periodId: PERIOD }) } as any
    );
    expect(res.status).toBe(400);
  });

  it('PATCH /periods maps a state conflict to 409', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'paid', currency: 'ILS', total_net: 1 }, error: null };
    const res = await patchPeriod(
      req(`/api/clinic/payroll/periods/${PERIOD}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clinic_id: CLINIC, action: 'approve' }),
      }),
      { params: Promise.resolve({ periodId: PERIOD }) } as any
    );
    expect(res.status).toBe(409);
  });

  it('POST /advances rejects a payee outside the clinic (404)', async () => {
    respond['providers.select'] = { data: null, error: null };
    const res = await postAdvance(req('/api/clinic/payroll/advances', jsonBody({ clinic_id: CLINIC, provider_id: PROVIDER, amount: 200 })));
    expect(res.status).toBe(404);
  });

  it('POST /advances creates a pending advance for an active provider', async () => {
    respond['providers.select'] = { data: { id: PROVIDER, name: 'x', deleted_at: null }, error: null };
    respond['staff_advances.insert'] = { data: { id: 'adv-9', status: 'pending' }, error: null };
    const res = await postAdvance(req('/api/clinic/payroll/advances', jsonBody({ clinic_id: CLINIC, provider_id: PROVIDER, amount: 200 })));
    expect(res.status).toBe(201);
    const payload = writes.find((w) => w.table === 'staff_advances')!.payload as any;
    expect(payload.status).toBe('pending');
    expect(payload.amount).toBe(200);
  });

  it('POST /adjustments requires a reason', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'draft', currency: 'ILS', total_net: 0 }, error: null };
    const res = await postAdjustment(req('/api/clinic/payroll/adjustments', jsonBody({ clinic_id: CLINIC, period_id: PERIOD, provider_id: PROVIDER, type: 'bonus', amount: 10 })));
    expect(res.status).toBe(400);
  });

  it('POST /adjustments needs a generated payslip first (404)', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'draft', currency: 'ILS', total_net: 0 }, error: null };
    respond['payslips.select'] = { data: null, error: null };
    const res = await postAdjustment(req('/api/clinic/payroll/adjustments', jsonBody({ clinic_id: CLINIC, period_id: PERIOD, provider_id: PROVIDER, type: 'bonus', amount: 10, reason: 'أداء' })));
    expect(res.status).toBe(404);
  });

  it('POST /adjustments is 409 once the period is approved', async () => {
    respond['payroll_periods.select'] = { data: { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', currency: 'ILS', total_net: 10 }, error: null };
    const res = await postAdjustment(req('/api/clinic/payroll/adjustments', jsonBody({ clinic_id: CLINIC, period_id: PERIOD, provider_id: PROVIDER, type: 'deduction', amount: 10, reason: 'تأخير' })));
    expect(res.status).toBe(409);
  });
});

