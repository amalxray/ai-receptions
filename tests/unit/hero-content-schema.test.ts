import { describe, expect, it } from 'vitest';
import { heroContentSchema } from '@/lib/landing/hero-schema';
import { landingCopy } from '@/lib/landing/landing-copy';

const validHero = {
  ...landingCopy.hero,
  description: 'منصة استقبال ذكية للمرضى.',
  ctaPrimaryHref: '/register',
  ctaSecondaryHref: '#how-it-works',
};

describe('heroContentSchema', () => {
  it('accepts valid Hero copy, internal links, and statistics', () => {
    expect(heroContentSchema.safeParse(validHero).success).toBe(true);
  });

  it('rejects empty required text', () => {
    expect(heroContentSchema.safeParse({ ...validHero, headline1: '   ' }).success).toBe(false);
  });

  it('rejects unsafe or malformed CTA destinations', () => {
    expect(heroContentSchema.safeParse({ ...validHero, ctaPrimaryHref: 'javascript:alert(1)' }).success).toBe(false);
    expect(heroContentSchema.safeParse({ ...validHero, ctaSecondaryHref: '//example.com/path' }).success).toBe(false);
  });

  it('rejects empty stats and more than six stats', () => {
    expect(heroContentSchema.safeParse({ ...validHero, stats: [] }).success).toBe(false);
    expect(heroContentSchema.safeParse({ ...validHero, stats: Array(7).fill({ value: '1', label: 'إحصائية' }) }).success).toBe(false);
  });
});
