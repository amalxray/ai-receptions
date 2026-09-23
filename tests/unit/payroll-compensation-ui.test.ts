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
  canManageCompensations,
  compensationSummary,
  isActiveProvider,
  isFutureDate,
  mergeCompensationState,
  providersNoun,
  salaryCounterLine,
  selectableProviders,
  todayIso,
  translateCompensationError,
  validateCompensationForm,
  withoutContractLine,
  type CompensationLite,
  type ProviderLite,
} from '@/components/dashboard/payroll/compensationUi';
import { PATCH as patchCompensation } from '@/app/api/clinic/payroll/compensations/[compensationId]/route';

/**
 * #38 follow-up — the per-provider salary screen. The screen itself is not
 * rendered here (this repository has no jsdom / Testing Library); what is
 * tested is the logic that decides what the screen shows and what it blocks.
 */

const CLINIC = '11111111-1111-1111-1111-111111111111';

function provider(id: string, name: string, extra: Partial<ProviderLite> = {}): ProviderLite {
  return { id, name, provider_type: 'dentist', ...extra };
}

function compensation(overrides: Partial<CompensationLite> = {}): CompensationLite {
  return {
    id: 'comp1',
    provider_id: 'prov1',
    model: 'fixed_monthly',
    commission_percent: null,
    fixed_monthly_amount: 3000,
    effective_from: '2026-09-01',
    status: 'active',
    ...overrides,
  };
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}

const handlerContext = { params: Promise.resolve({ compensationId: 'comp1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'u1' }, role: 'owner' });
});
describe('mergeCompensationState — الذين لهم راتب والتي لا راتب', () => {
  it('marks a provider without a contract as having none', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'د. حلا'), provider('prov2', 'ربيع')], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hasActiveContract === false)).toBe(true);
  });

  it('attaches the active contract and flags it as having a salary', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'د. حلا')], [compensation()]);
    expect(rows[0].hasActiveContract).toBe(true);
    expect(rows[0].compensation?.id).toBe('comp1');
  });

  it('ignores ENDED contracts (status !== active)', () => {
    const { rows, notPayable } = mergeCompensationState([provider('prov1', 'د. حلا')], [
      compensation({ status: 'ended' }),
    ]);
    expect(rows[0].hasActiveContract).toBe(false);
    expect(notPayable).toHaveLength(0);
  });

  it('KEEPS soft-deleted providers in the list, flagged with isDeleted', () => {
    const { rows } = mergeCompensationState([
      provider('prov1', 'د. حلا'),
      provider('prov2', 'محذوف', { deleted_at: '2026-09-01T00:00:00Z', active: false }),
    ], []);
    // Task #38 follow-up: the screen no longer filters silently — «1 من 2» while the
    // clinic has more providers was the bug being fixed.
    expect(rows.map((r) => r.provider.id)).toEqual(['prov1', 'prov2']);
    expect(rows.find((r) => r.provider.id === 'prov2')?.isDeleted).toBe(true);
    expect(rows.find((r) => r.provider.id === 'prov1')?.isDeleted).toBe(false);
  });

  it('lists active providers before soft-deleted ones', () => {
    const { rows } = mergeCompensationState([
      provider('prov1', 'أحمد', { active: false }),
      provider('prov2', 'بشار'),
      provider('prov3', 'تامر'),
    ], []);
    expect(rows.map((r) => r.provider.name)).toEqual(['بشار', 'تامر', 'أحمد']);
  });

  it('treats an explicitly inactive provider (active: false, no deleted_at) as deleted', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'موقوف', { active: false })], []);
    expect(rows[0].isDeleted).toBe(true);
  });

  it('reports a contract of an inactive provider separately instead of listing it as payable', () => {
    const { rows, notPayable } = mergeCompensationState([
      provider('prov1', 'د. حلا'),
      provider('prov2', 'محذوف', { active: false }),
    ], [compensation({ provider_id: 'prov2' })]);
    expect(rows.map((r) => r.provider.id)).toEqual(['prov1', 'prov2']);
    expect(notPayable).toHaveLength(1);
    expect(notPayable[0].providerName).toBe('محذوف');
  });

  it('reports a contract whose provider is missing entirely (no crash)', () => {
    const { rows, notPayable } = mergeCompensationState([], [compensation({ provider_id: 'ghost' })]);
    expect(rows).toHaveLength(0);
    expect(notPayable).toHaveLength(1);
    expect(notPayable[0].providerName).toBeNull();
  });

  it('keeps the latest effective_from when history holds more than one active row', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'د. حلا')], [
      compensation({ id: 'old', effective_from: '2026-01-01' }),
      compensation({ id: 'new', effective_from: '2026-09-01' }),
    ]);
    expect(rows[0].compensation?.id).toBe('new');
  });
});

describe('selectableProviders — زر «إضافة راتب» المفعّل فقط', () => {
  it('offers a provider with no contract and no soft-delete', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'د. حلا')], []);
    expect(selectableProviders(rows).map((p) => p.id)).toEqual(['prov1']);
  });

  it('excludes a provider that already has an active contract', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'د. حلا')], [compensation()]);
    expect(selectableProviders(rows)).toHaveLength(0);
  });

  it('excludes a soft-deleted provider even though it has no contract', () => {
    const { rows } = mergeCompensationState([provider('prov1', 'محذوف', { active: false })], []);
    expect(rows).toHaveLength(1);
    expect(selectableProviders(rows)).toHaveLength(0);
  });
});

describe('providersNoun — التصريف العربي للعدد', () => {
  it('0 → لا أحد', () => {
    expect(providersNoun(0)).toBe('لا أحد');
  });

  it('1 → منتسب واحد', () => {
    expect(providersNoun(1)).toBe('منتسب واحد');
  });

  it('2 → منتسبان', () => {
    expect(providersNoun(2)).toBe('منتسبان');
  });

  it('3-10 → X منتسبين', () => {
    expect(providersNoun(3)).toBe('3 منتسبين');
    expect(providersNoun(7)).toBe('7 منتسبين');
    expect(providersNoun(10)).toBe('10 منتسبين');
  });

  it('11+ → X منتسباً', () => {
    expect(providersNoun(11)).toBe('11 منتسباً');
    expect(providersNoun(42)).toBe('42 منتسباً');
  });

  it('never breaks on a negative or fractional input', () => {
    expect(providersNoun(-3)).toBe('لا أحد');
    expect(providersNoun(2.9)).toBe('منتسبان');
  });
});

describe('salaryCounterLine — عدّاد «X من Y»', () => {
  it('the case from the bug report: 1 of 7', () => {
    expect(salaryCounterLine(1, 7)).toBe('1 من 7 منتسبين لهم راتب مُعرَّف.');
  });

  it('the verb follows the TOTAL (Y): 2 of 7 stays plural لهم', () => {
    expect(salaryCounterLine(2, 7)).toBe('2 من 7 منتسبين لهم راتب مُعرَّف.');
  });

  it('11+ returns to the singular noun', () => {
    expect(salaryCounterLine(3, 12)).toBe('3 من 12 منتسباً لهم راتب مُعرَّف.');
  });

  it('none of them → لا أحد with a SINGULAR verb', () => {
    expect(salaryCounterLine(0, 7)).toBe('لا أحد من 7 منتسبين له راتب مُعرَّف.');
    expect(salaryCounterLine(0, 12)).toBe('لا أحد من 12 منتسباً له راتب مُعرَّف.');
    expect(salaryCounterLine(0, 2)).toBe('لا أحد من 2 منتسبين له راتب مُعرَّف.');
  });

  it('a single provider in the clinic → Y reads «منتسب واحد»', () => {
    expect(salaryCounterLine(1, 1)).toBe('1 من منتسب واحد له راتب مُعرَّف.');
    expect(salaryCounterLine(0, 1)).toBe('لا أحد من منتسب واحد له راتب مُعرَّف.');
  });

  it('two providers in the clinic → the dual total takes لهما', () => {
    expect(salaryCounterLine(2, 2)).toBe('2 من 2 منتسبين لهما راتب مُعرَّف.');
    expect(salaryCounterLine(1, 2)).toBe('1 من 2 منتسبين لهما راتب مُعرَّف.');
  });

  it('an empty clinic does not print «0 من 0»', () => {
    expect(salaryCounterLine(0, 0)).toBe('لا يوجد منتسبون.');
  });
});

describe('withoutContractLine — سطر «بلا راتب مُعرَّف»', () => {
  it('singular uses لن يظهر', () => {
    expect(withoutContractLine(1)).toBe('منتسب واحد بلا راتب مُعرَّف — لن يظهر في القسائم.');
  });

  it('dual uses the plural verb لن يظهروا', () => {
    expect(withoutContractLine(2)).toBe('منتسبان بلا راتب مُعرَّف — لن يظهروا في القسائم.');
  });

  it('3-10 → X منتسبين', () => {
    expect(withoutContractLine(3)).toBe('3 منتسبين بلا راتب مُعرَّف — لن يظهروا في القسائم.');
  });

  it('11+ → X منتسباً', () => {
    expect(withoutContractLine(11)).toBe('11 منتسباً بلا راتب مُعرَّف — لن يظهروا في القسائم.');
  });
});

describe('compensationSummary — النص العربي المعروض', () => {
  it('fixed monthly', () => {
    expect(compensationSummary(compensation())).toBe('راتب ثابت 3000.00 شهرياً');
  });

  it('commission percentage', () => {
    expect(compensationSummary(compensation({
      model: 'commission_percentage', fixed_monthly_amount: null, commission_percent: 15,
    }))).toBe('نسبة 15% من الإيراد');
  });

  it('hybrid shows both', () => {
    expect(compensationSummary(compensation({
      model: 'hybrid', fixed_monthly_amount: 2000, commission_percent: 12.5,
    }))).toBe('2000.00 + 12.50% من الإيراد');
  });
});

describe('canManageCompensations — القرار ٣: owner | accountant فقط', () => {
  it('allows owner and accountant', () => {
    expect(canManageCompensations('owner')).toBe(true);
    expect(canManageCompensations('accountant')).toBe(true);
  });

  it('denies manager (reads only) and everyone else', () => {
    expect(canManageCompensations('manager')).toBe(false);
    expect(canManageCompensations('doctor')).toBe(false);
    expect(canManageCompensations(null)).toBe(false);
  });
});

describe('isFutureDate — سطر «سيُحفظ تاريخ السريان للسجل.»', () => {
  it('is true only for dates strictly after today', () => {
    expect(isFutureDate('2026-10-01', '2026-09-23')).toBe(true);
    expect(isFutureDate('2026-09-23', '2026-09-23')).toBe(false);
    expect(isFutureDate('2026-09-01', '2026-09-23')).toBe(false);
  });

  it('is false for empty or malformed input (no note for a half-typed date)', () => {
    expect(isFutureDate('', '2026-09-23')).toBe(false);
    expect(isFutureDate('2026-9-3', '2026-09-23')).toBe(false);
  });

  it('todayIso returns a yyyy-mm-dd string', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('isActiveProvider treats an explicitly inactive provider as inactive', () => {
    expect(isActiveProvider(provider('p', 'x'))).toBe(true);
    expect(isActiveProvider(provider('p', 'x', { active: false }))).toBe(false);
  });
});

describe('validateCompensationForm — يمنع 400/500 قبل الإرسال', () => {
  const base = {
    providerId: 'prov1',
    model: 'fixed_monthly' as const,
    commissionPercent: '',
    fixedMonthlyAmount: '3000',
    effectiveFrom: '2026-09-01',
  };

  it('accepts a consistent fixed_monthly form', () => {
    expect(validateCompensationForm(base)).toHaveLength(0);
  });

  it('accepts hybrid with both values', () => {
    expect(validateCompensationForm({
      ...base, model: 'hybrid', commissionPercent: '10', fixedMonthlyAmount: '2000',
    })).toHaveLength(0);
  });

  it('requires a monthly amount for fixed_monthly', () => {
    const errors = validateCompensationForm({ ...base, fixedMonthlyAmount: '' });
    expect(errors.map((e) => e.field)).toContain('amount');
    expect(errors.find((e) => e.field === 'amount')?.message).toBe('أدخل المبلغ الشهري.');
  });

  it('rejects a percentage above 100', () => {
    const errors = validateCompensationForm({
      ...base, model: 'commission_percentage', commissionPercent: '150', fixedMonthlyAmount: '',
    });
    expect(errors.map((e) => e.field)).toContain('commission');
  });

  it('requires a percentage for commission_percentage', () => {
    const errors = validateCompensationForm({
      ...base, model: 'commission_percentage', commissionPercent: '', fixedMonthlyAmount: '',
    });
    expect(errors.map((e) => e.field)).toContain('commission');
  });

  it('requires BOTH values for hybrid', () => {
    const errors = validateCompensationForm({
      ...base, model: 'hybrid', commissionPercent: '10', fixedMonthlyAmount: '',
    });
    expect(errors.map((e) => e.field)).toContain('amount');
  });

  it('rejects fields that do not belong to the model', () => {
    const errors = validateCompensationForm({ ...base, commissionPercent: '10' });
    expect(errors.map((e) => e.field)).toContain('commission');
  });

  it('requires provider, model and effective date', () => {
    const errors = validateCompensationForm({
      providerId: '', model: '', commissionPercent: '', fixedMonthlyAmount: '', effectiveFrom: '',
    });
    expect(errors.map((e) => e.field).sort()).toEqual(['effective_from', 'model', 'provider']);
  });

  it('rejects a negative amount and a non-numeric percentage', () => {
    expect(validateCompensationForm({ ...base, fixedMonthlyAmount: '-5' }).map((e) => e.field)).toContain('amount');
    expect(validateCompensationForm({
      ...base, model: 'commission_percentage', commissionPercent: 'abc', fixedMonthlyAmount: '',
    }).map((e) => e.field)).toContain('commission');
  });
});

describe('translateCompensationError — لا يرى المستخدم نص Postgres خام', () => {
  it('maps the duplicate-active-contract 409', () => {
    expect(translateCompensationError(409, 'duplicate key value violates unique constraint "clinic_provider_compensations_one_active"'))
      .toBe('هذا المنتسب له راتب نشط بالفعل — أنهِ العقد الحالي أولاً ثم أضف العقد الجديد.');
  });

  it('maps the model/fields mismatch 400', () => {
    expect(translateCompensationError(400, 'COMPENSATION_MODEL_FIELDS_MISMATCH'))
      .toContain('الحقول لا تطابق النموذج');
  });

  it('maps auth failures', () => {
    expect(translateCompensationError(401, 'Unauthorized')).toContain('انتهت الجلسة');
    expect(translateCompensationError(403, 'Forbidden')).toContain('للمالك والمحاسب فقط');
  });

  it('maps a check-constraint 500 without leaking the constraint name', () => {
    const message = translateCompensationError(
      500,
      'new row for relation "clinic_provider_compensations" violates check constraint "clinic_provider_compensations_commission_range"'
    );
    expect(message).toContain('قيمة غير صحيحة');
    expect(message).not.toContain('clinic_provider_compensations');
  });

  it('maps a missing effective_from 500', () => {
    expect(translateCompensationError(
      500,
      'null value in column "effective_from" of relation "clinic_provider_compensations" violates not-null constraint'
    )).toBe('تاريخ السريان مطلوب.');
  });

  it('falls back to a generic Arabic message', () => {
    expect(translateCompensationError(500, 'something exploded')).toBe('تعذر الحفظ — حاول مرة أخرى.');
    expect(translateCompensationError(400, '')).toBe('طلب غير مكتمل — أعد تحميل الصفحة وحاول مرة أخرى.');
  });
});

describe('PATCH /api/clinic/payroll/compensations/[id] — إنهاء العقد (بوابة الكتابة)', () => {
  const patchRequest = () =>
    makeRequest('/api/clinic/payroll/compensations/comp1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC, status: 'ended' }),
    });

  it('403 for a manager — the screen disables the button for exactly this reason', async () => {
    mockAuth.roleDenied.mockImplementationOnce(() => ({ authorized: false, status: 403 }));
    const res = await patchCompensation(patchRequest(), handlerContext);
    expect(res.status).toBe(403);
  });

  it('200 for owner with status=ended', async () => {
    const builder = mockSupabaseAdmin.makeBuilder({ data: { id: 'comp1', status: 'ended' }, error: null });
    (mockSupabaseAdmin.supabaseAdmin.from as any).mockReturnValueOnce(builder);
    const res = await patchCompensation(patchRequest(), handlerContext);
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('ended');
  });

  it('400 without clinic_id', async () => {
    const res = await patchCompensation(
      makeRequest('/api/clinic/payroll/compensations/comp1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ended' }),
      }),
      handlerContext
    );
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });
    const res = await patchCompensation(patchRequest(), handlerContext);
    expect(res.status).toBe(401);
  });
});

