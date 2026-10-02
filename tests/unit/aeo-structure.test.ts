import { describe, it, expect } from 'vitest';
import { buildAeoSummary, buildAeoSections } from '@/lib/seo/aeo-structure';

describe('AEO/GEO public structure', () => {
  it('builds a clear public summary from real fields only', () => {
    const summary = buildAeoSummary({
      entityName: 'Demo Dental Clinic',
      title: 'دكتور أسنان',
      description: 'عيادة أسنان تقدم خدمات الفحص والتحضير والعناية.',
      city: 'عمّان',
      area: 'وسط المدينة',
      services: ['الفحص', 'تنظيف الأسنان'],
    });

    expect(summary).toContain('Demo Dental Clinic');
    expect(summary).toContain('دكتور أسنان');
    expect(summary).toContain('عمّان');
    expect(summary).not.toMatch(/FAQ|مراجعات|تقييم|جائزة|اختصار/gi);
  });

  it('creates semantic sections without inventing claims', () => {
    const sections = buildAeoSections({
      entityName: 'Dr. Ahmad Hassan',
      services: ['Dental Exam', 'Teeth Whitening'],
      city: 'عمّان',
    });

    expect(sections[0].heading).toBe('Dr. Ahmad Hassan');
    expect(sections.some((section) => section.heading === 'الخدمات')).toBe(true);
    expect(sections.some((section) => section.heading === 'معلومات العيادة')).toBe(true);
    expect(sections[0].content).toContain('Dr. Ahmad Hassan');
    expect(JSON.stringify(sections)).not.toMatch(/FAQ|تقييم|شهادة|جائزة/gi);
  });
});
