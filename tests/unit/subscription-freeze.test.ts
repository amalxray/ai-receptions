import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as cancelPost } from '@/app/api/subscription/cancel/route';
import { POST as resumePost } from '@/app/api/subscription/resume/route';

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
  ADMIN_ROLES: ['owner', 'manager'],
}));

const mockDb = vi.hoisted(() => ({
  from: vi.fn(),
  subscription: {
    id: 'subscription-1',
    clinic_id: '11111111-1111-1111-1111-111111111111',
    stripe_subscription_id: 'sub_test_1',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: '2099-01-01T00:00:00.000Z',
  } as Record<string, unknown>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

const mockStripe = vi.hoisted(() => ({
  cancelStripeSubscriptionAtPeriodEnd: vi.fn(),
  resumeStripeSubscription: vi.fn(),
}));

vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockDb }));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => mockStripe);

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';

function request(path: string) {
  return new Request(`http://localhost${path}?clinic_id=${CLINIC_ID}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'price' }),
  });
}

function installDatabaseMock() {
  mockDb.from.mockImplementation((table: string) => {
    const query: any = {
      select: vi.fn(() => query),
      update: vi.fn((values: Record<string, unknown>) => {
        mockDb.updates.push({ table, values });
        return query;
      }),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: mockDb.subscription, error: null })),
      then: (resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve, reject),
    };
    return query;
  });
}

describe('subscription freeze transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.updates.length = 0;
    mockDb.subscription = {
      id: 'subscription-1',
      clinic_id: CLINIC_ID,
      stripe_subscription_id: 'sub_test_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: '2099-01-01T00:00:00.000Z',
    };
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'owner-1' }, role: 'owner' });
    mockStripe.cancelStripeSubscriptionAtPeriodEnd.mockResolvedValue({
      success: true,
      cancel_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    });
    mockStripe.resumeStripeSubscription.mockResolvedValue({ success: true });
    installDatabaseMock();
  });

  it('records scheduled cancellation while keeping clinic state cancelled until period end', async () => {
    const response = await cancelPost(request('/api/subscription/cancel'));

    expect(response.status).toBe(200);
    const subscriptionUpdate = mockDb.updates.find((update) => update.table === 'subscriptions');
    expect(subscriptionUpdate?.values).toMatchObject({
      status: 'canceled',
      cancel_at_period_end: true,
    });
    expect(Date.parse(String(subscriptionUpdate?.values.cancelled_at))).not.toBeNaN();
    expect(mockDb.updates.find((update) => update.table === 'clinics')?.values).toEqual({
      subscription_status: 'cancelled',
    });
  });

  it('restores the clinic to active when the subscription is resumed', async () => {
    mockDb.subscription.status = 'canceled';
    mockDb.subscription.cancel_at_period_end = true;

    const response = await resumePost(request('/api/subscription/resume'));

    expect(response.status).toBe(200);
    expect(mockDb.updates.find((update) => update.table === 'clinics')?.values).toEqual({
      subscription_status: 'active',
    });
  });
});
