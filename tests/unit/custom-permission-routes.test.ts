import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  permissionDenied: vi.fn(),
  recordExpense: vi.fn(),
  listExpenses: vi.fn(),
  calendarStatus: vi.fn(),
  disconnectCalendar: vi.fn(),
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
}));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mocks.permissionDenied,
}));
vi.mock('@/lib/services/accounting', () => ({
  recordExpense: mocks.recordExpense,
  listExpenses: mocks.listExpenses,
}));
vi.mock('@/lib/services/googleCalendarOAuth', () => ({
  createGoogleCalendarAuthorizationUrl: vi.fn(() => 'https://calendar.example.test/authorize'),
  disconnectGoogleCalendar: mocks.disconnectCalendar,
  getMissingGoogleCalendarOAuthSettings: vi.fn(() => []),
  getGoogleCalendarConnectionStatus: mocks.calendarStatus,
  isGoogleCalendarOAuthConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

import { GET as expensesGET, POST as expensesPOST } from '@/app/api/clinic/accounting/expenses/route';
import { GET as calendarGET } from '@/app/api/clinic/google-calendar/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';

function request(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: { authorization: 'Bearer staff-token', ...init.headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeClinicRequest.mockResolvedValue({
    authorized: true,
    user: { id: 'staff-user' },
    role: 'staff',
  });
  mocks.permissionDenied.mockResolvedValue(null);
  mocks.recordExpense.mockResolvedValue({ id: 'expense-1' });
  mocks.listExpenses.mockResolvedValue({ items: [], hasMore: false });
  mocks.calendarStatus.mockResolvedValue({ connected: false, connected_at: null, email: null });
});

describe('custom permission route access for staff', () => {
  it('authorizes expense listing with view_financial or manage_expenses', async () => {
    const res = await expensesGET(request('http://localhost/api/clinic/accounting/expenses?clinic_id=' + CLINIC));

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, ['view_financial', 'manage_expenses']);
  });

  it('authorizes expense creation with manage_expenses', async () => {
    const res = await expensesPOST(request('http://localhost/api/clinic/accounting/expenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC, amount: 12 }),
    }));

    expect(res.status).toBe(201);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_expenses');
    expect(mocks.recordExpense).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'staff-user' }));
  });

  it('authorizes Google Calendar status with manage_settings', async () => {
    const res = await calendarGET(
      request('http://localhost/api/clinic/google-calendar?clinic_id=' + CLINIC)
    );

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_settings');
  });
});
