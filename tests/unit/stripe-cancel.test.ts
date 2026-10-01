import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelStripeSubscriptionAtPeriodEnd,
  resumeStripeSubscription,
} from '@/lib/payments/stripe';

describe('Stripe subscription cancellation helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  });

  it('marks a subscription to cancel at period end', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as unknown as (...args: any[]) => Promise<any>);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub_123',
        cancel_at_period_end: true,
        cancel_at: 1730000000,
      }),
    });

    const result = await cancelStripeSubscriptionAtPeriodEnd('sub_123');

    expect(result).toEqual({ success: true, cancel_at: 1730000000 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/subscriptions/sub_123',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
        }),
      })
    );
  });

  it('resumes a subscription before the current period ends', async () => {
    const fetchMock = vi.mocked(globalThis.fetch as unknown as (...args: any[]) => Promise<any>);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'sub_123',
        cancel_at_period_end: false,
      }),
    });

    const result = await resumeStripeSubscription('sub_123');

    expect(result).toEqual({ success: true });
  });
});
