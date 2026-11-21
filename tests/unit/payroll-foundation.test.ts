import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn((auth: any, _roles: readonly string[]) =>
    auth && auth.authorized === false ? { authorized: false, status: auth.status ?? 403 } : null),
  FINANCE_ADMIN_ROLES: ['owner', 'accountant'],
  FINANCE_READ_ROLES: ['owner', 'accountant', 'manager', 'receptionist'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockAudit = vi.hoisted(() => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/services/auditService', () => mockAudit);

const mockSupabaseAdmin = vi.hoisted(() => {
  function makeBuilder(result: { data: unknown; error: unknown }) {
    const b: Record<string, any> = {};
    const CHAIN = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'is', 'in', 'or', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle'];
    for (const m of CHAIN) b[m] = vi.fn(() => b);
    b.then = (resolve: (v: unknown) => void) => resolve(result);
    return b;
  }
  const supabaseAdmin = {
    from: vi.fn(() => makeBuilder({ data: [], error: null })),
    rpc: vi.fn(async () => ({ data: {}, error: null })),
  };
  return { supabaseAdmin, makeBuilder };
});
vi.mock('@/lib/supabase/admin', () => mockSupabaseAdmin);

import {
  createCompensation,
  reviseCompensation,
  updateCompensation,
  listProviderRevenue,
} from '@/lib/services/payroll';
import { POST as postCompensation, GET as listCompensationsRoute } from '@/app/api/clinic/payroll/compensations/route';
import { POST as postCompensationRevision } from '@/app/api/clinic/payroll/compensations/[compensationId]/revision/route';
import { GET as getRevenue } from '@/app/api/clinic/payroll/revenue/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}
function jsonBody(data: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u1' }, role: 'owner' });
});

describe('compensation configuration (D-P1 — config only, no calculation)', () => {
  it('rejects model/fields mismatch BEFORE any write (service-side mirror of DB CHECK)', async () => {
    await expect(createCompensation({
      clinicId: CLINIC, providerId: 'prov1', model: 'commission_percentage',
      effectiveFrom: '2026-01-01', actorUserId: 'u1',
    })).rejects.toThrow('COMPENSATION_MODEL_FIELDS_MISMATCH');
    await expect(createCompensation({
      clinicId: CLINIC, providerId: 'prov1', model: 'hybrid',
      commissionPercent: 30, effectiveFrom: '2026-01-01', actorUserId: 'u1',
    })).rejects.toThrow('COMPENSATION_MODEL_FIELDS_MISMATCH');
    expect(mockSupabaseAdmin.supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('creates a valid hybrid config and writes an audit entry', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: { id: 'c1', model: 'hybrid', status: 'active' }, error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    const res = await createCompensation({
      clinicId: CLINIC, providerId: 'prov1', model: 'hybrid',
      commissionPercent: 30, fixedMonthlyAmount: 2000, effectiveFrom: '2026-01-01', actorUserId: 'u1',
    });
    expect(res.id).toBe('c1');
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: CLINIC, model: 'hybrid', attribution_base: 'issued', status: 'active',
    }));
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'payroll.compensation.created' }));
  });

  it('updateCompensation scopes by clinic_id + id (tenant-safe patch)', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: { id: 'c1', status: 'ended' }, error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    await updateCompensation({ clinicId: CLINIC, compensationId: 'c1', status: 'ended', actorUserId: 'u1' });
    expect(builder.eq).toHaveBeenCalledWith('clinic_id', CLINIC);
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ended' }));
  });

  it('revises compensation through one atomic RPC and preserves the existing record', async () => {
    const current = {
      id: 'old-comp',
      provider_id: 'prov1',
      model: 'fixed_monthly',
      commission_percent: null,
      fixed_monthly_amount: 3000,
      effective_from: '2026-01-01',
      effective_to: null,
      notes: 'original terms',
      status: 'active',
    };
    const builder = mockSupabaseAdmin.makeBuilder({ data: current, error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    mockSupabaseAdmin.supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ id: 'new-comp', provider_id: 'prov1', fixed_monthly_amount: 3500 }],
      error: null,
    } as any);

    const revised = await reviseCompensation({
      clinicId: CLINIC,
      compensationId: 'old-comp',
      effectiveFrom: '2026-12-01',
      commissionPercent: null,
      fixedMonthlyAmount: 3500,
      actorUserId: 'u1',
    });

    expect(revised.id).toBe('new-comp');
    expect(mockSupabaseAdmin.supabaseAdmin.rpc).toHaveBeenCalledWith(
      'revise_clinic_provider_compensation',
      expect.objectContaining({
        p_clinic_id: CLINIC,
        p_compensation_id: 'old-comp',
        p_effective_from: '2026-12-01',
        p_fixed_monthly_amount: 3500,
      }),
    );
    expect(builder.update).not.toHaveBeenCalled();
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'payroll.compensation.revised',
      metadata: expect.objectContaining({ previous_compensation_id: 'old-comp', new_compensation_id: 'new-comp' }),
    }));
  });

  it('rejects a mid-month revision before reading or writing compensation', async () => {
    await expect(reviseCompensation({
      clinicId: CLINIC,
      compensationId: 'old-comp',
      effectiveFrom: '2026-12-15',
      commissionPercent: null,
      fixedMonthlyAmount: 3500,
      actorUserId: 'u1',
    })).rejects.toThrow('COMPENSATION_EFFECTIVE_DATE_INVALID');
    expect(mockSupabaseAdmin.supabaseAdmin.from).not.toHaveBeenCalled();
    expect(mockSupabaseAdmin.supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('exposes dated revisions only through the payroll management API', async () => {
    const currentBuilder = mockSupabaseAdmin.makeBuilder({
      data: {
        id: 'old-comp',
        provider_id: 'prov1',
        model: 'fixed_monthly',
        commission_percent: null,
        fixed_monthly_amount: 3000,
        effective_from: '2026-01-01',
        effective_to: null,
        notes: null,
        status: 'active',
      },
      error: null,
    });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(currentBuilder);
    mockSupabaseAdmin.supabaseAdmin.rpc.mockResolvedValueOnce({
      data: [{ id: 'new-comp' }],
      error: null,
    } as any);

    const response = await postCompensationRevision(
      makeRequest('/api/clinic/payroll/compensations/old-comp/revision', jsonBody({
        clinic_id: CLINIC,
        fixed_monthly_amount: 3500,
        commission_percent: null,
        effective_from: '2026-12-01',
      })),
      { params: Promise.resolve({ compensationId: 'old-comp' }) },
    );

    expect(response.status).toBe(200);
    expect(mockSupabaseAdmin.supabaseAdmin.rpc).toHaveBeenCalledWith(
      'revise_clinic_provider_compensation',
      expect.objectContaining({ p_compensation_id: 'old-comp', p_effective_from: '2026-12-01' }),
    );
  });
});

describe('provider revenue (D-P2 — derived read, issued base)', () => {
  it('reads from the derived view with tenant scoping and month filters', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: [{ revenue_month: '2026-09-01', issued_revenue: 500 }], error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    const rows = await listProviderRevenue(CLINIC, { providerId: 'prov1', fromMonth: '2026-01-01' });
    expect(rows[0].issued_revenue).toBe(500);
    expect(mockSupabaseAdmin.supabaseAdmin.from).toHaveBeenCalledWith('provider_revenue');
    expect(builder.eq).toHaveBeenCalledWith('clinic_id', CLINIC);
    expect(builder.gte).toHaveBeenCalledWith('revenue_month', '2026-01-01');
  });

  it('never writes: revenue read issues no insert/update/rpc calls', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: [], error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    await listProviderRevenue(CLINIC);
    expect(builder.insert).not.toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
    expect(mockSupabaseAdmin.supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});

describe('payroll API (D-P3 — FINANCE RBAC)', () => {
  it('creates compensation → 201 for FINANCE_ADMIN', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: { id: 'c1', model: 'commission_percentage', status: 'active' }, error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    const res = await postCompensation(makeRequest('/api/clinic/payroll/compensations', jsonBody({
      clinic_id: CLINIC, provider_id: 'prov1', model: 'commission_percentage',
      commission_percent: 25, effective_from: '2026-01-01',
    })));
    expect(res.status).toBe(201);
  });

  it('401 when unauthenticated', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });
    const res = await postCompensation(makeRequest('/api/clinic/payroll/compensations', jsonBody({
      clinic_id: CLINIC, provider_id: 'prov1', model: 'commission_percentage', commission_percent: 10, effective_from: '2026-01-01',
    })));
    expect(res.status).toBe(401);
  });

  it('403 for non-FINANCE roles on configuration write', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({
      authorized: true,
      user: { id: 'u1' },
      role: 'staff',
    });
    const res = await postCompensation(makeRequest('/api/clinic/payroll/compensations', jsonBody({
      clinic_id: CLINIC, provider_id: 'prov1', model: 'fixed_monthly', fixed_monthly_amount: 1000, effective_from: '2026-01-01',
    })));
    expect(res.status).toBe(403);
  });

  it('maps model/fields mismatch to 400', async () => {
    const res = await postCompensation(makeRequest('/api/clinic/payroll/compensations', jsonBody({
      clinic_id: CLINIC, provider_id: 'prov1', model: 'fixed_monthly', commission_percent: 10, effective_from: '2026-01-01',
    })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('COMPENSATION_MODEL_FIELDS_MISMATCH');
  });

  it('GET compensations for FINANCE_READ', async () => {
    const res = await listCompensationsRoute(makeRequest(`/api/clinic/payroll/compensations?clinic_id=${CLINIC}`));
    expect(res.status).toBe(200);
  });

  it('GET revenue for FINANCE_READ — read-only surface', async () => {
    const res = await getRevenue(makeRequest(`/api/clinic/payroll/revenue?clinic_id=${CLINIC}`));
    expect(res.status).toBe(200);
  });

  it('revenue GET without clinic_id → 400', async () => {
    const res = await getRevenue(makeRequest('/api/clinic/payroll/revenue'));
    expect(res.status).toBe(400);
  });
});
