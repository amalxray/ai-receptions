/**
 * Phase 5 — SEO/AEO tests: sitemap reviews URLs + clinic schema geo.
 */
import { describe, it, expect } from 'vitest';
import { buildClinicSchema } from '@/lib/services/doctorJsonLd';

describe('Phase 5 SEO/AEO', () => {
  it('أ) clinic schema includes geo when coordinates present', () => {
    const schema = buildClinicSchema({ name: 'عيادة', latitude: 31.9, longitude: 35.2 });
    expect(schema.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 31.9, longitude: 35.2 });
  });

  it('ب) clinic schema omits geo when coordinates missing', () => {
    const schema = buildClinicSchema({ name: 'عيادة' });
    expect(schema).not.toHaveProperty('geo');
  });

  it('ج) clinic schema keeps sameAs/address/telephone (Phase 2 intact)', () => {
    const schema = buildClinicSchema({
      name: 'عيادة',
      phone: '0599123456',
      city: 'رام الله',
      socialLinks: { facebook: 'https://facebook.com/x', instagram: 'https://instagram.com/x' },
    });
    expect(schema.telephone).toBe('0599123456');
    expect(schema).toHaveProperty('address');
    expect(schema).toHaveProperty('sameAs');
  });

  it('د) RSS route file exists with review items contract', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/api/public/reviews/rss/route.ts', 'utf8');
    expect(src).toContain('<rss version="2.0"');
    expect(src).toContain('.limit(20)');
    expect(src).toContain("eq('is_published', true)");
  });

  it('هـ) llms.txt documents /reviews + RSS', async () => {
    const fs = await import('fs');
    const txt = fs.readFileSync('public/llms.txt', 'utf8');
    expect(txt).toContain('.dentairec.com/reviews');
    expect(txt).toContain('/api/public/reviews/rss');
  });

  it('و) sitemap includes /reviews entries for active clinics', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/sitemap.ts', 'utf8');
    expect(src).toContain('/reviews');
    expect(src).toContain("priority: 0.7");
  });
});
