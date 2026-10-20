import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const result: { data: unknown; error: unknown } = {
    data: { id: 'article-1', slug: 'valid-article', title: 'Article', content: '<p>Text</p>' },
    error: null,
  };
  const select = vi.fn();
  const query: Record<string, any> = {};
  for (const method of ['from', 'eq', 'lte', 'order', 'range', 'update']) {
    query[method] = vi.fn(() => query);
  }
  query.select = select.mockImplementation(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { result, query, select };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: dbMocks.query }));

import { getPublishedArticle, listPublishedArticles } from '@/lib/services/askContent';

describe('public article database reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.result.data = { id: 'article-1', slug: 'valid-article', title: 'Article', content: '<p>Text</p>' };
    dbMocks.result.error = null;
  });

  it('does not select featured_image_url, which is absent from platform_articles', async () => {
    await getPublishedArticle('valid-article');
    await listPublishedArticles({ limit: 1 });

    expect(dbMocks.select).toHaveBeenCalledTimes(2);
    for (const [columns] of dbMocks.select.mock.calls) {
      expect(columns).not.toContain('featured_image_url');
      expect(columns).toContain('featured_image:featured_image_id');
    }
  });

  it('surfaces article query failures for the route to convert into a 404', async () => {
    dbMocks.result.error = { message: 'database unavailable' };
    await expect(getPublishedArticle('valid-article')).rejects.toThrow('database unavailable');
  });
});
