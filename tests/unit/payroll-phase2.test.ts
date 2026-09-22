import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Payroll Phase 2 contracts.
 *
 * The security-critical decisions live at two edges:
 *   1. UNLOCK is owner-only (a manager must be refused before any DB work) and
 *      needs a written reason.
 *   2. INSTALLMENTS are taken one per payroll (never the whole principal) and
 *      the per-installment amount is stored, not re-derived.
 * Both are asserted against the real modules with a chainable DB double.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(
    (auth: any, roles: readonly string[]) =>
      !auth?.authorized
        ? { authorized: false, status: auth?.status ?? 403 }
        : roles.includes(auth.role)
          ? null
          : { authorized: false, status: 403 }
  ),
  ADMIN_ROLES: ['owner', 'manager'],
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
  FINANCE_ADMIN_ROLES: ['owner', 'accountant'],
  FINANCE_READ_ROLES: ['owner', 'accountant', 'manager'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockPermissions = vi.hoisted(() => ({ gate: vi.fn(async () => null) }));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mockPermissions.gate,
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/services/auditService', () => ({ writeAuditLog: vi.fn(async () => undefined) }));

// Chainable supabase-admin double: every builder resolves to the table's rows.
const db = vi.hoisted(() => {
  const state: { rows: Record<string, unknown[]>; updates: any[]; inserts: any[] } = {
    rows: {},
    updates: [],
    inserts: [],
  };
  const builder = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: (state.rows[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (state.rows[table] ?? [])[0] ?? null, error: null }),
      insert: (payload: any) => {
        state.inserts.push({ table, payload });
        return b;
      },
      update: (payload: any) => {
        state.updates.push({ table, payload });
        return b;
      },
      delete: () => b,
      then: (resolve: any) => resolve({ data: state.rows[table] ?? [], error: null }),
    };
    return b;
  };
  return {
    state,
    client: { from: vi.fn((table: string) => builder(table)) },
  };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: db.client }));

import { createAdvance, generatePayrollPeriod } from '@/lib/services/payroll-engine';
import { POST as unlockPOST } from '@/app/api/clinic/payroll/periods/[periodId]/unlock/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PERIOD = '22222222-2222-2222-2222-222222222222';
const PROVIDER = '33333333-3333-3333-3333-333333333333';

function jsonRequest(body: unknown): Request {
  return new Request('https://test.local/api/clinic/payroll/periods/x/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.state.rows = {};
  db.state.updates = [];
  db.state.inserts = [];
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u-owner' }, role: 'owner' });
  mockPermissions.gate.mockResolvedValue(null);
});


describe('installment advances', () => {
  it('rejects an installment count outside 1..12', async () => {
    await expect(
      createAdvance({
        clinicId: CLINIC, providerId: PROVIDER, amount: 600, installmentCount: 13, actorUserId: null,
      })
    ).rejects.toThrow('ADVANCE_INSTALLMENTS_INVALID');
  });

  it('stores the per-installment amount when the advance is created', async () => {
    db.state.rows.providers = [{ id: PROVIDER, name: 'د. س', deleted_at: null }];
    db.state.rows.staff_advances = [{ id: 'adv-1' }];

    await createAdvance({
      clinicId: CLINIC, providerId: PROVIDER, amount: 600, installmentCount: 6, actorUserId: null,
    });

    const insert = db.state.inserts.find((i) => i.table === 'staff_advances');
    expect(insert).toBeTruthy();
    expect(insert!.payload.installment_count).toBe(6);
    expect(insert!.payload.installment_amount).toBe(100);
    expect(insert!.payload.months_paid).toBe(0);
  });

  it('takes ONE installment in the payslip, never the whole principal', async () => {
    db.state.rows.clinic_provider_compensations = [
      { provider_id: PROVIDER, model: 'fixed_monthly', commission_percent: 0, fixed_monthly_amount: 1000 },
    ];
    db.state.rows.providers = [{ id: PROVIDER, name: 'د. س', deleted_at: null }];
    db.state.rows.provider_revenue = [];
    db.state.rows.staff_advances = [
      { id: 'adv-1', provider_id: PROVIDER, amount: 600, installment_count: 6, installment_amount: 100, months_paid: 1 },
    ];
    db.state.rows.clinic_settings = [{ currency: 'ILS' }];
    db.state.rows.payroll_periods = [{ id: PERIOD, status: 'draft' }];

    const result = await generatePayrollPeriod({
      clinicId: CLINIC, periodMonth: '2026-09', actorUserId: null,
    });

    // One installment (100), not the principal (600) and not the remainder (500).
    expect(result.breakdown[0].advances_amount).toBe(100);
    expect(result.totals.advances).toBe(100);
    expect(result.totals.net).toBe(900);

    const slipInsert = db.state.inserts.find((i) => i.table === 'payslips');
    expect(slipInsert!.payload.breakdown.advance_details).toEqual([
      { advance_id: 'adv-1', amount: 100, installment_number: 2, installments: 6 },
    ]);
  });

  it('stops taking installments once the advance is fully repaid', async () => {
    db.state.rows.clinic_provider_compensations = [
      { provider_id: PROVIDER, model: 'fixed_monthly', commission_percent: 0, fixed_monthly_amount: 1000 },
    ];
    db.state.rows.providers = [{ id: PROVIDER, name: 'د. س', deleted_at: null }];
    db.state.rows.provider_revenue = [];
    db.state.rows.staff_advances = [
      { id: 'adv-1', provider_id: PROVIDER, amount: 600, installment_count: 6, installment_amount: 100, months_paid: 6 },
    ];
    db.state.rows.clinic_settings = [{ currency: 'ILS' }];
    db.state.rows.payroll_periods = [{ id: PERIOD, status: 'draft' }];

    const result = await generatePayrollPeriod({
      clinicId: CLINIC, periodMonth: '2026-09', actorUserId: null,
    });
    expect(result.breakdown[0].advances_amount).toBe(0);
    expect(result.totals.net).toBe(1000);
  });
});


describe('POST /api/clinic/payroll/periods/[periodId]/unlock — owner only', () => {
  it('refuses a manager BEFORE any engine work', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u-mgr' }, role: 'manager' });
    const res = await unlockPOST(
      jsonRequest({ clinic_id: CLINIC, reason: 'تصحيح خطأ في العمولة' }),
      { params: Promise.resolve({ periodId: PERIOD }) }
    );
    expect(res.status).toBe(403);
    expect(db.state.updates).toHaveLength(0);
  });

  it('requires a written reason from the owner', async () => {
    const res = await unlockPOST(
      jsonRequest({ clinic_id: CLINIC, reason: 'خطأ' }),
      { params: Promise.resolve({ periodId: PERIOD }) }
    );
    expect(res.status).toBe(400);
    expect(db.state.updates).toHaveLength(0);
  });

  it('unlocks a finalized period for the owner and audits it', async () => {
    db.state.rows.payroll_periods = [
      { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'approved', unlock_count: 0 },
    ];
    const res = await unlockPOST(
      jsonRequest({ clinic_id: CLINIC, reason: 'تصحيح خطأ في العمولة' }),
      { params: Promise.resolve({ periodId: PERIOD }) }
    );
    expect(res.status).toBe(200);

    const update = db.state.updates.find((u) => u.table === 'payroll_periods');
    expect(update!.payload.status).toBe('draft');
    expect(update!.payload.unlock_count).toBe(1);
    expect(update!.payload.unlock_reason).toContain('تصحيح');

    const audit = db.state.inserts.find((i) => i.table === 'payroll_audit_log');
    expect(audit!.payload.action).toBe('unlocked');
  });

  it('cannot unlock a draft (nothing to re-open)', async () => {
    db.state.rows.payroll_periods = [
      { id: PERIOD, clinic_id: CLINIC, period_month: '2026-09', status: 'draft', unlock_count: 0 },
    ];
    const res = await unlockPOST(
      jsonRequest({ clinic_id: CLINIC, reason: 'تصحيح خطأ في العمولة' }),
      { params: Promise.resolve({ periodId: PERIOD }) }
    );
    expect(res.status).toBe(400);
  });
});
