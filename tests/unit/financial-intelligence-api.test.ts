import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PP-5 — Financial Intelligence API route tests (RBAC + shape).
 * Separate file from the service tests so the service module can be mocked
 * here without shadowing the real implementation used there.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn((auth: any, _roles: readonly string[]) =>
    auth && auth.authorized === false ? { status: auth.status ?? 403 } : null),
  FINANCE_READ_ROLES: ['owner', 'accountant', 'manager', 'receptionist'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockFI = vi.hoisted(() => ({ getFinancialIntelligence: vi.fn() }));
vi.mock('@/lib/services/financialIntelligence', () => mockFI);

// The subscription gate (commit 2d6f0c3) is REAL production behaviour verified
// by the subscription suite. This file exercises the FI route for RBAC + the
// payroll payload shape, so the gate is mocked as allowed unless a test denies it.
const mockGate = vi.hoisted(() => ({
  featureGateForClinic: vi.fn(async () => ({ allowed: true, requiredPlan: 'growth', planNameAr: 'نمو' })),
}));
vi.mock('@/lib/subscription/featureGateServer', () => mockGate);

import { GET } from '@/app/api/clinic/financial-intelligence/route';

const req = (clinicId = 'c1') =>
  new Request(`http://localhost/api/clinic/financial-intelligence?clinic_id=${clinicId}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true });
  mockGate.featureGateForClinic.mockResolvedValue({ allowed: true, requiredPlan: 'growth', planNameAr: 'نمو' });
});

describe('PP-5 API route — RBAC and shape', () => {
  it('400 when clinic_id missing', async () => {
    const res = await GET(new Request('http://localhost/api/clinic/financial-intelligence'));
    expect(res.status).toBe(400);
    expect(mockAuth.authorizeClinicRequest).not.toHaveBeenCalled();
  });

  it('401 for unauthenticated callers (no data exposure)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFI.getFinancialIntelligence).not.toHaveBeenCalled();
  });

  it('403 for unauthorized actors — patient portal roles cannot read FI', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mockFI.getFinancialIntelligence).not.toHaveBeenCalled();
    expect(mockAuth.roleDenied).toHaveBeenCalledWith(expect.anything(), mockAuth.FINANCE_READ_ROLES);
  });

  it('200 with derived data for an authorized finance role; clinic_id passed through untouched', async () => {
    mockFI.getFinancialIntelligence.mockResolvedValue({ kpis: { revenue: 1 } });
    const res = await GET(req('c1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kpis.revenue).toBe(1);
    expect(mockFI.getFinancialIntelligence).toHaveBeenCalledWith('c1', { fromMonth: undefined, toMonth: undefined });
  });

  it('forwards from_month/to_month query params', async () => {
    mockFI.getFinancialIntelligence.mockResolvedValue({});
    await GET(new Request('http://localhost/api/clinic/financial-intelligence?clinic_id=c1&from_month=2026-01-01&to_month=2026-03-01'));
    expect(mockFI.getFinancialIntelligence).toHaveBeenCalledWith('c1', { fromMonth: '2026-01-01', toMonth: '2026-03-01' });
  });

  it('400 on INVALID_ month errors, 500 otherwise (no stack leakage)', async () => {
    mockFI.getFinancialIntelligence.mockRejectedValue(new Error('INVALID_FROM_MONTH'));
    expect((await GET(req())).status).toBe(400);
    mockFI.getFinancialIntelligence.mockRejectedValue(new Error('boom'));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('boom');
  });

  it('passes the 20261018 payroll disclosure through untouched (meta + per-month share)', async () => {
    mockFI.getFinancialIntelligence.mockResolvedValue({
      kpis: { revenue: 9000, expenses: 4000, netPosition: 5000 },
      pnlTrends: [{ month: '2026-01-01', revenue: 9000, expenses: 4000, net: 5000, payroll: 2500 }],
      meta: { includesPayroll: true, payrollTotal: 2500 },
    });
    const res = await GET(
      new Request('http://localhost/api/clinic/financial-intelligence?clinic_id=c1&from_month=2026-01-01&to_month=2026-01-01')
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { meta: { includesPayroll: boolean; payrollTotal: number }; pnlTrends: { payroll: number }[] };
    };
    expect(body.data.meta.includesPayroll).toBe(true);
    expect(body.data.meta.payrollTotal).toBe(2500);
    expect(body.data.pnlTrends[0].payroll).toBe(2500); // inside expenses, never added again
  });

  it('402 when the subscription gate denies — the payroll passthrough never bypasses gating', async () => {
    mockGate.featureGateForClinic.mockResolvedValue({ allowed: false, requiredPlan: 'growth', planNameAr: 'نمو' });
    const res = await GET(req());
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe('FEATURE_LOCKED');
    expect(mockFI.getFinancialIntelligence).not.toHaveBeenCalled();
  });
});
