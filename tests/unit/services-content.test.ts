import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES, normalizeServicesContent, servicesContentSchema } from '@/lib/landing/services-content';

describe('services CMS content', () => {
  it('uses the 12 static services when no saved content exists', () => {
    expect(normalizeServicesContent(null).items).toHaveLength(12);
  });

  it('preserves uploaded image URLs in saved service data', () => {
    const items = DEFAULT_SERVICES.map((service, index) => ({
      ...service,
      image_url: index === 0 ? 'https://storage.example.com/service.jpg' : '',
    }));

    expect(servicesContentSchema.safeParse({ items }).success).toBe(true);
    expect(normalizeServicesContent({ items }).items[0].image_url).toBe('https://storage.example.com/service.jpg');
  });

  it('fills detailed copy for existing CMS records without discarding their images', () => {
    const items = DEFAULT_SERVICES.map((service, index) => ({
      title: service.title,
      description: service.description,
      category: service.category,
      icon: service.icon,
      image_url: index === 0 ? 'https://storage.example.com/existing-service.jpg' : '',
    }));

    const normalized = normalizeServicesContent({ items });

    expect(normalized.items[0].details).toBe(DEFAULT_SERVICES[0].details);
    expect(normalized.items[0].image_url).toBe('https://storage.example.com/existing-service.jpg');
  });

  it('rejects unsafe image URLs', () => {
    const items = DEFAULT_SERVICES.map((service, index) => ({
      ...service,
      image_url: index === 0 ? 'javascript:alert(1)' : '',
    }));

    expect(servicesContentSchema.safeParse({ items }).success).toBe(false);
  });
});
