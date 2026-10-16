/**
 * AEO enhancements — platform relations in clinic schema.
 */
import { describe, it, expect } from 'vitest';
import { buildClinicSchema } from '@/lib/services/doctorJsonLd';

describe('Clinic schema AEO (platform relations)', () => {
  it('أ) includes isPartOf AI-Receptions website node', () => {
    const schema = buildClinicSchema({ name: 'عيادة', slug: 'hala-clinic' });
    expect(schema.isPartOf).toEqual({
      '@type': 'WebSite',
      name: 'AI-Receptions',
      alternateName: ['سنّي', 'Dentairec'],
      url: 'https://www.dentairec.com',
    });
  });

  it('ب) includes ReserveAction booking target on tenant subdomain', () => {
    const schema = buildClinicSchema({ name: 'عيادة', slug: 'hala-clinic' });
    expect(schema.potentialAction).toEqual({
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://hala-clinic.dentairec.com/book',
        actionPlatform: 'http://schema.org/DesktopWebPlatform',
      },
      result: { '@type': 'Reservation', name: 'حجز موعد' },
    });
  });

  it('ج) omits potentialAction without slug (backward compatible)', () => {
    const schema = buildClinicSchema({ name: 'عيادة' });
    expect(schema).toHaveProperty('isPartOf');
    expect(schema).not.toHaveProperty('potentialAction');
  });

  it('د) includes hasOfferCatalog mirroring services', () => {
    const schema = buildClinicSchema({
      name: 'عيادة',
      services: [{ name: 'تنظيف' }, { name: 'حشوة' }],
    });
    expect(schema).toHaveProperty('makesOffer');
    const catalog = schema.hasOfferCatalog as any;
    expect(catalog['@type']).toBe('OfferCatalog');
    expect(catalog.itemListElement).toHaveLength(2);
    expect(catalog.itemListElement[0]).toMatchObject({ position: 1 });
  });

  it('هـ) omits catalog without services', () => {
    const schema = buildClinicSchema({ name: 'عيادة' });
    expect(schema).not.toHaveProperty('makesOffer');
    expect(schema).not.toHaveProperty('hasOfferCatalog');
  });

  it('و) llms.txt documents subdomains + platform names', async () => {
    const fs = await import('fs');
    const txt = fs.readFileSync('public/llms.txt', 'utf8');
    expect(txt).toContain('سنّي · Dentairec');
    expect(txt).toContain('https://{slug}.dentairec.com');
    expect(txt).toContain('https://{slug}.dentairec.com/reviews');
    expect(txt).toContain('## المنصة الطبية');
  });
});
