import { describe, expect, it } from 'vitest';
import { faqContentSchema, featuresContentSchema, heroContentSchema, landingColorsContentSchema, landingSeoContentSchema, pricingContentSchema, testimonialsContentSchema, urgencyBarContentSchema } from '@/lib/landing/hero-schema';
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

describe('homepage section content schemas', () => {
  it('accepts valid feature cards and rejects unsafe destinations', () => {
    const features = {
      eyebrow: 'لماذا نحن', title: 'عنوان', titleAccent: 'مميز', subtitle: 'وصف',
      cards: [{ icon: '✨', title: 'ميزة', desc: 'تفاصيل الميزة', href: '/register', cta: 'ابدأ' }],
    };
    expect(featuresContentSchema.safeParse(features).success).toBe(true);
    expect(featuresContentSchema.safeParse({ ...features, cards: [{ ...features.cards[0], href: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('requires FAQ questions and answers and bounds the list', () => {
    expect(faqContentSchema.safeParse({ title: 'أسئلة', items: [{ q: 'سؤال؟', a: 'جواب.' }] }).success).toBe(true);
    expect(faqContentSchema.safeParse({ title: 'أسئلة', items: [{ q: '', a: 'جواب.' }] }).success).toBe(false);
    expect(faqContentSchema.safeParse({ title: 'أسئلة', items: Array(31).fill({ q: 'سؤال؟', a: 'جواب.' }) }).success).toBe(false);
  });

  it('accepts testimonial photo URLs only when they are local or HTTPS', () => {
    const testimonial = { title: 'آراء', subtitle: 'الوصف', items: [{ content: 'رأي المراجع.', doctor_name: 'د. ريم', specialty: 'تقويم', rating: 5, image_url: '/images/reem.webp' }] };
    expect(testimonialsContentSchema.safeParse(testimonial).success).toBe(true);
    expect(testimonialsContentSchema.safeParse({ ...testimonial, items: [{ ...testimonial.items[0], image_url: 'http://insecure.example/photo.png' }] }).success).toBe(false);
  });

  it('accepts only known, unique billing plan IDs for display packages', () => {
    const pricing = landingCopy.pricing;
    expect(pricingContentSchema.safeParse(pricing).success).toBe(true);
    expect(pricingContentSchema.safeParse({ ...pricing, tiers: [pricing.tiers[0], { ...pricing.tiers[1], id: 'unknown' }, pricing.tiers[2]] }).success).toBe(false);
    expect(pricingContentSchema.safeParse({ ...pricing, tiers: [pricing.tiers[0], { ...pricing.tiers[1], id: 'basic' }] }).success).toBe(false);
  });

  it('validates urgency colors and supported ticker speeds', () => {
    expect(urgencyBarContentSchema.safeParse(landingCopy.urgencyBar).success).toBe(true);
    expect(urgencyBarContentSchema.safeParse({ ...landingCopy.urgencyBar, backgroundColor: 'red' }).success).toBe(false);
    expect(urgencyBarContentSchema.safeParse({ ...landingCopy.urgencyBar, tickerSpeed: 'insane' }).success).toBe(false);
  });

  it('validates hex colors and safe SEO images', () => {
    expect(landingColorsContentSchema.safeParse(landingCopy.colors).success).toBe(true);
    expect(landingColorsContentSchema.safeParse({ ...landingCopy.colors, primary: 'violet' }).success).toBe(false);
    expect(landingSeoContentSchema.safeParse({ ...landingCopy.seo, og_image: '/images/social.png' }).success).toBe(true);
    expect(landingSeoContentSchema.safeParse({ ...landingCopy.seo, og_image: 'javascript:alert(1)' }).success).toBe(false);
  });
});
