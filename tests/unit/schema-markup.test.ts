import { describe, it, expect } from 'vitest';
import { buildClinicSchema } from '@/lib/services/doctorJsonLd';

describe('Advanced schema allow-list', () => {
  it('keeps public social links and excludes private email values from sameAs', () => {
    const schema = buildClinicSchema({
      name: 'Demo Dental Clinic',
      pageUrl: 'https://example.com/c/demo-dental-clinic',
      description: 'Dental care for families',
      socialLinks: {
        website: 'https://example.com',
        instagram: 'https://instagram.com/demo-dental',
        email: 'private@demo.com',
        whatsapp: 'https://wa.me/123456789',
      },
    });

    expect(schema.sameAs).toEqual([
      'https://example.com',
      'https://instagram.com/demo-dental',
      'https://wa.me/123456789',
    ]);
    expect(String(schema.sameAs ?? '')).not.toContain('private@demo.com');
  });
});
