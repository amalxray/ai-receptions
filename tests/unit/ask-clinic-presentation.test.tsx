import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TestimonialsSection from '@/components/ask/TestimonialsSection';
import { displayAskClinicName, dedupeAskTestimonials } from '@/lib/services/askClinicPresentation';

describe('/ask presentation safeguards', () => {
  it('replaces technical slugs and English hyphenated names with Arabic labels', () => {
    expect(displayAskClinicName('ahmad-clinic', 'clinic')).toBe('عيادة شريكة');
    expect(displayAskClinicName('Amal X-Ray Center', 'imaging_center')).toBe('مركز طبي');
    expect(displayAskClinicName('مركز أمل للتصوير', 'imaging_center')).toBe('مركز أمل للتصوير');
  });

  it('keeps only the first testimonial for a repeated author or repeated content', () => {
    const testimonials = [
      { patient_name: 'سارة', content: 'تجربة ممتازة', id: '1' },
      { patient_name: ' سارة ', content: 'تعليق مختلف', id: '2' },
      { patient_name: 'محمد', content: ' تجربة   ممتازة ', id: '3' },
      { patient_name: 'ليلى', content: 'تعليق آخر', id: '4' },
    ];
    expect(dedupeAskTestimonials(testimonials).map((item) => item.id)).toEqual(['1', '4']);
  });

  it('does not repeat a small deduplicated testimonial set in the marquee', () => {
    const html = renderToStaticMarkup(
      React.createElement(TestimonialsSection, {
        testimonials: [
          { id: '1', patient_name: 'سارة', content: 'تجربة أولى', rating: 5 },
          { id: '2', patient_name: 'سارة', content: 'تجربة مكررة', rating: 5 },
        ],
      })
    );
    expect(html.match(/تجربة أولى/g)).toHaveLength(1);
    expect(html).not.toContain('تجربة مكررة');
  });
});