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