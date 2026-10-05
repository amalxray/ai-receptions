import { describe, expect, it } from 'vitest';
import { describeLandingOrderDatabaseError, getLandingOrderDatabaseErrorFields, normalizeLandingPageOrder } from '@/lib/landing/landing-order';

const allowedKeys = ['hero', 'features', 'faq'] as const;

describe('landing page section order', () => {
  it('deduplicates submitted keys and appends allowed sections omitted by older clients', () => {
    expect(normalizeLandingPageOrder(['features', 'features'], allowedKeys))
      .toEqual(['features', 'hero', 'faq']);
  });

  it('rejects keys that are not registered landing sections', () => {
    expect(() => normalizeLandingPageOrder(['hero', 'new_section'], allowedKeys))
      .toThrow('مفاتيح أقسام غير معروفة: new_section');
  });

  it('preserves structured PostgREST error information', () => {
    expect(describeLandingOrderDatabaseError({
      code: '42501',
      message: 'permission denied for table landing_page_order',
      details: 'Role does not have INSERT privilege',
      hint: 'Grant the required permission',
    })).toContain('permission denied for table landing_page_order — code=42501 — details=Role does not have INSERT privilege — hint=Grant the required permission');
  });

  it('suggests the schema migration when the order table is missing', () => {
    expect(describeLandingOrderDatabaseError({
      code: '42P01',
      message: 'relation "public.landing_page_order" does not exist',
    })).toContain('db/migrations/20261004_landing_page_order.sql');
  });

  it('keeps PostgREST error fields even when the error inherits from Error', () => {
    const error = Object.assign(new Error('[object Object]'), {
      code: '42501',
      details: 'permission denied',
      hint: 'check grants',
      status: 403,
    });

    expect(describeLandingOrderDatabaseError(error)).toContain('code=42501');
    expect(getLandingOrderDatabaseErrorFields(error)).toMatchObject({
      message: '[object Object]',
      code: '42501',
      details: 'permission denied',
      hint: 'check grants',
      status: 403,
    });
  });
});
