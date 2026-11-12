import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissionDenied: vi.fn(),
  authorizeClinicRequest: vi.fn(),
  listInvoices: vi.fn(),
  getInvoiceDetail: vi.fn(),
  listPayments: vi.fn(),
  listExpenses: vi.fn(),
  listExpenseCategories: vi.fn(),
  getPatientBalances: vi.fn(),
  issueInvoice: vi.fn(),
  voidPayment: vi.fn(),
  listWriteOffs: vi.fn(),
  getAgingSummary: vi.fn(),
  getDailyCashPositions: vi.fn(),
  listCashSessions: vi.fn(),
}));

vi.mock('@/lib/services/permissionGate', () => ({ permissionDenied: mocks.permissionDenied }));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  roleDenied: vi.fn(),
  INVOICE_CREATE_ROLES: [],
  FINANCE_ADMIN_ROLES: [],
  PAYMENT_RECORD_ROLES: [],
}));
vi.mock('@/lib/services/accounting', () => ({
  listInvoices: mocks.listInvoices,
  getInvoiceDetail: mocks.getInvoiceDetail,
  listPayments: mocks.listPayments,
  listExpenses: mocks.listExpenses,
  listExpenseCategories: mocks.listExpenseCategories,
  getPatientBalances: mocks.getPatientBalances,
  issueInvoice: mocks.issueInvoice,
  voidPayment: mocks.voidPayment,
  listWriteOffs: mocks.listWriteOffs,
  getAgingSummary: mocks.getAgingSummary,
  getDailyCashPositions: mocks.getDailyCashPositions,
  listCashSessions: mocks.listCashSessions,
  recordPayment: vi.fn(),
  recordExpense: vi.fn(),
  createExpenseCategory: vi.fn(),
}));
vi.mock('@/lib/notifications/inAppNotifier', () => ({ createInAppNotification: vi.fn() }));
vi.mock('@/lib/services/tenantAccess', () => ({ getClinicSlugById: vi.fn() }));

import { GET as getExpenses } from '@/app/api/clinic/accounting/expenses/route';
import { GET as getExpenseCategories } from '@/app/api/clinic/accounting/expense-categories/route';
import { GET as getInvoices } from '@/app/api/clinic/accounting/invoices/route';
import { GET as getInvoice } from '@/app/api/clinic/accounting/invoices/[invoiceId]/route';
import { GET as getPayments } from '@/app/api/clinic/accounting/payments/route';
import { GET as getBalances } from '@/app/api/clinic/accounting/balances/route';
import { GET as getAdjustments } from '@/app/api/clinic/accounting/adjustments/route';
import { GET as getAging } from '@/app/api/clinic/accounting/aging/route';
import { GET as getDailyCash } from '@/app/api/clinic/accounting/cash/daily/route';
import { GET as getCashSessions } from '@/app/api/clinic/accounting/cash/sessions/route';
import { POST as postInvoice } from '@/app/api/clinic/accounting/invoices/route';
import { POST as postPaymentVoid } from '@/app/api/clinic/accounting/payments/[paymentId]/void/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://test.local${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissionDenied.mockResolvedValue(null);
  mocks.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'staff-user' }, role: 'staff' });
  mocks.listInvoices.mockResolvedValue({ items: [], hasMore: false });
  mocks.getInvoiceDetail.mockResolvedValue({ id: 'invoice-1' });
  mocks.listPayments.mockResolvedValue({ items: [], hasMore: false });
  mocks.listExpenses.mockResolvedValue({ items: [], hasMore: false });
  mocks.listExpenseCategories.mockResolvedValue([]);
  mocks.getPatientBalances.mockResolvedValue([]);
  mocks.issueInvoice.mockResolvedValue({ id: 'invoice-1' });
  mocks.voidPayment.mockResolvedValue({ voided: true });
  mocks.listWriteOffs.mockResolvedValue([]);
  mocks.getAgingSummary.mockResolvedValue({ buckets: [], totalOutstanding: 0, rows: [] });
  mocks.getDailyCashPositions.mockResolvedValue([]);
  mocks.listCashSessions.mockResolvedValue([]);
});

describe('finance read routes accept the matching management permission', () => {
  it.each([
    [
      'expense list',
      () => getExpenses(request(`/api/clinic/accounting/expenses?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_expenses'],
    ],
    [
      'expense categories',
      () => getExpenseCategories(request(`/api/clinic/accounting/expense-categories?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_expenses'],
    ],
    [
      'invoice list',
      () => getInvoices(request(`/api/clinic/accounting/invoices?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_invoices'],
    ],
    [
      'invoice detail',
      () => getInvoice(request(`/api/clinic/accounting/invoices/invoice-1?clinic_id=${CLINIC}`), {
        params: Promise.resolve({ invoiceId: 'invoice-1' }),
      }),
      ['view_financial', 'manage_invoices'],
    ],
    [
      'payment list',
      () => getPayments(request(`/api/clinic/accounting/payments?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_payments'],
    ],
    [
      'patient balances',
      () => getBalances(request(`/api/clinic/accounting/balances?clinic_id=${CLINIC}&patient_id=patient-1`)),
      ['view_financial', 'manage_invoices', 'manage_payments'],
    ],
    [
      'invoice aging',
      () => getAging(request(`/api/clinic/accounting/aging?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_invoices'],
    ],
    [
      'invoice adjustments',
      () => getAdjustments(request(`/api/clinic/accounting/adjustments?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_invoices'],
    ],
    [
      'daily cash positions',
      () => getDailyCash(request(`/api/clinic/accounting/cash/daily?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_payments'],
    ],
    [
      'cash session list',
      () => getCashSessions(request(`/api/clinic/accounting/cash/sessions?clinic_id=${CLINIC}`)),
      ['view_financial', 'manage_payments'],
    ],
  ] as const)('gates the %s with either the shared or specific permission', async (_name, invoke, expectedKeys) => {
    const response = await invoke();

    expect(response.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, expectedKeys);
  });
});

describe('finance writes use dedicated permissions instead of roleDenied', () => {
  it('requires manage_invoices for discounted invoices', async () => {
    const response = await postInvoice(request('/api/clinic/accounting/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC, items: [], discount: 10 }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.permissionDenied).toHaveBeenNthCalledWith(2, expect.any(Request), CLINIC, 'manage_invoices');
  });

  it('requires manage_payments to void a payment', async () => {
    const response = await postPaymentVoid(request(`/api/clinic/accounting/payments/payment-1/void?clinic_id=${CLINIC}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'duplicate entry' }),
    }), { params: Promise.resolve({ paymentId: 'payment-1' }) });

    expect(response.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_payments');
  });
});
