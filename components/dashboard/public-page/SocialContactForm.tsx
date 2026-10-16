import type { PublicContactField } from './shared/types';

/** Contact constants + validator (moved verbatim from PublicPageManager). */

export const SOCIAL_FIELD_KEYS: PublicContactField[] = ['whatsapp', 'facebook', 'instagram', 'website', 'email'];

export const SOCIAL_LABELS: Record<PublicContactField, string> = {
  whatsapp: 'واتساب',
  facebook: 'فيسبوك',
  instagram: 'انستغرام',
  website: 'الموقع الإلكتروني',
  email: 'البريد الإلكتروني',
};

export const SOCIAL_ICONS: Record<PublicContactField, string> = {
  whatsapp: '💬',
  facebook: 'f',
  instagram: '◎',
  website: '🌐',
  email: '✉️',
};

export const SECTION_LABELS: Record<string, string> = {
  hero: 'الغلاف (Hero)',
  about: 'نبذة عن العيادة',
  services: 'الخدمات',
  providers: 'مقدمو الخدمة',
  hours: 'ساعات العمل',
  offers: 'العروض',
  gallery: 'الصور',
  beforeAfter: 'قبل / بعد',
  badges: 'شارات الإنجازات',
  contact: 'التواصل',
  bookingCta: 'زر الحجز',
  aiCta: 'زر المساعد الذكي',
  qrShare: 'QR / مشاركة',
  achievements: 'الإنجازات',
  testimonials: 'شهادات المرضى',
  articles: 'المقالات',
  news: 'شريط الأخبار',
};

export function validatePublicContactValue(field: PublicContactField, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (field) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
        ? null
        : 'يرجى إدخال بريد إلكتروني صحيح';
    case 'website':
      return /^https?:\/\//i.test(trimmed)
        ? null
        : 'يرجى إدخال رابط صحيح يبدأ بـ http:// أو https://';
    case 'whatsapp': {
      if (/^\+?[0-9\s-]{7,}$/.test(trimmed)) return null;
      if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\/[0-9]+$/i.test(trimmed)) return null;
      return 'يرجى إدخال رقم واتساب أو رابط wa.me صحيح';
    }
    case 'facebook':
      return /^https?:\/\/(www\.)?facebook\.com\//i.test(trimmed)
        ? null
        : 'يرجى إدخال رابط فيسبوك صحيح';
    case 'instagram':
      return /^https?:\/\/(www\.)?instagram\.com\//i.test(trimmed)
        ? null
        : 'يرجى إدخال رابط إنستغرام صحيح';
    default:
      return null;
  }
}
