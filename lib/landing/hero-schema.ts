import { z } from 'zod';

const nonEmptyText = (max: number) => z.string().trim().min(1, 'هذا الحقل مطلوب').max(max);

const safeHref = z
  .string()
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(600)
  .refine((value) => {
    if (value.startsWith('#')) return value.length > 1 && !/[\s\\]/.test(value);
    if (value.startsWith('/') && !value.startsWith('//')) return !/[\\\s]/.test(value);
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'استخدم رابطاً داخلياً أو رابط HTTPS صالحاً');

export const heroContentSchema = z.object({
  headline1: nonEmptyText(160),
  headline2: nonEmptyText(160),
  paragraph: nonEmptyText(500),
  description: nonEmptyText(800),
  ctaPrimary: nonEmptyText(100),
  ctaPrimaryHref: safeHref,
  ctaSecondary: nonEmptyText(100),
  ctaSecondaryHref: safeHref,
  stats: z.array(z.object({
    value: nonEmptyText(30),
    label: nonEmptyText(80),
  })).min(1).max(6),
}).strict();

export type ValidatedHeroContent = z.infer<typeof heroContentSchema>;

const safeMediaUrl = z.string().trim().max(1000).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return !/[\\\s]/.test(value);
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'استخدم رابط صورة محلياً أو HTTPS صالحاً');

export { safeMediaUrl as landingMediaUrlSchema };

const featureCardSchema = z.object({
  icon: nonEmptyText(16),
  title: nonEmptyText(100),
  desc: nonEmptyText(500),
  href: safeHref,
  cta: z.string().trim().max(100).optional(),
}).strict();

export const featuresContentSchema = z.object({
  eyebrow: nonEmptyText(100),
  title: nonEmptyText(160),
  titleAccent: nonEmptyText(100),
  subtitle: nonEmptyText(500),
  cards: z.array(featureCardSchema).min(1).max(12),
}).strict();

export const faqContentSchema = z.object({
  title: nonEmptyText(160),
  items: z.array(z.object({
    q: nonEmptyText(300),
    a: nonEmptyText(2000),
  }).strict()).min(1).max(30),
}).strict();

export const testimonialsContentSchema = z.object({
  title: nonEmptyText(160),
  subtitle: nonEmptyText(300),
  items: z.array(z.object({
    content: nonEmptyText(1500),
    doctor_name: nonEmptyText(120),
    specialty: nonEmptyText(120),
    rating: z.number().int().min(1).max(5),
    image_url: safeMediaUrl.optional().default(''),
  }).strict()).min(1).max(30),
}).strict();