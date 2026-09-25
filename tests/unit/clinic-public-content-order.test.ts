import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listPublicContent, contentTableFor } from '@/lib/services/clinicPublicContent';

/**
 * B2 regression guard — the public-content ordering column.
 *
 * 20260928_public_page_content.sql gives `clinic_news_ticker` a `priority`
 * column while achievements/testimonials/articles use `display_order`.
 * Ordering the news ticker by `display_order` made PostgREST reject the whole
 * read (42703) and the ticker rendered empty.
 */

const mockState = vi.hoisted(() => ({
  orderCalls: [] as Array<{ table: string; column: string; ascending?: boolean }>,
  error: null as any,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = (column: string, opts?: { ascending?: boolean }) => {
        mockState.orderCalls.push({ table, column, ascending: opts?.ascending });
        return chain;
      };
      chain.then = (res: (x: unknown) => void) =>
        res({ data: [{ id: 'row-1' }], error: mockState.error });
      return chain;
    }),
  },
}));

const CID = '11111111-1111-1111-1111-111111111111';

describe('B2 — listPublicContent orders by the real column per table', () => {
  beforeEach(() => {
    mockState.orderCalls = [];
    mockState.error = null;
  });

  it('orders achievements/testimonials/articles by display_order', async () => {
    for (const type of ['achievements', 'testimonials', 'articles'] as const) {
      await listPublicContent(CID, type);
      expect(mockState.orderCalls.at(-1)).toEqual({
        table: contentTableFor(type),
        column: 'display_order',
        ascending: true,
      });
    }
  });

  it('orders the news ticker by priority (it has no display_order column)', async () => {
    await listPublicContent(CID, 'news');

    expect(contentTableFor('news')).toBe('clinic_news_ticker');
    expect(mockState.orderCalls).toEqual([
      { table: 'clinic_news_ticker', column: 'priority', ascending: true },
    ]);
  });

  it('never asks any content table for display_order on the news ticker', async () => {
    await listPublicContent(CID, 'news');

    expect(mockState.orderCalls.some((c) => c.column === 'display_order')).toBe(false);
  });

  it('surfaces a read error as a thrown Error (never a silent empty list)', async () => {
    mockState.error = { message: 'column clinic_news_ticker.display_order does not exist' };

    await expect(listPublicContent(CID, 'news')).rejects.toThrow(
      'column clinic_news_ticker.display_order does not exist'
    );
  });
});