/**
 * Refactor guard — public-page tabs split preserved every section + save path.
 * External heavy components (ImageUpload, PublicMediaManager) are mocked:
 * out of refactor scope, browser-only behavior.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ui/ImageUpload', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@/components/dashboard/clinic/PublicMediaManager', () => ({
  default: () => <span>معرض الصور</span>,
}));
import ShareTab from '@/components/dashboard/public-page/ShareTab';
import IdentityTab from '@/components/dashboard/public-page/IdentityTab';
import AppearanceTab from '@/components/dashboard/public-page/AppearanceTab';
import ContentTab from '@/components/dashboard/public-page/ContentTab';
import { Tabs } from '@/components/dashboard/public-page/shared/Tabs';
import type { PageConfig, InfoFormState, PublicContactField } from '@/components/dashboard/public-page/shared/types';

const config = {
  slug: 'amal', public_id: 'p1', pageUrl: '/amal', canonicalUrl: 'https://amal.dentairec.com',
  show_phone: true, show_prices: false, show_providers: true, discovery_enabled: false,
  social_links: {}, sections: { hero: true }, hidden_services: [], hidden_providers: [],
  services: [{ id: 's1', name: 'تنظيف' }],
  providers: [{ id: 'd1', name: 'د. أحمد', title: null, specialty: 'تقويم' }],
  display: {
    image_size: 'medium', video_size: 'medium', gallery_spacing: 'normal',
    body_text: 'medium', heading: 'medium', section_title: 'medium',
    cover_blur: 0, cover_position: 'center', cover_offset_y: 50,
    cover_height: 384, cover_fit: 'cover', news_height: 'md', news_font: 'base',
  },
} as unknown as PageConfig;

const noop = () => Promise.resolve();
const infoForm = {
  description: '', tagline: '', about: '', cover_url: '', logo: '',
  show_providers: true, discovery_enabled: false,
} as InfoFormState;
const contactForm = {
  description: '', tagline: '', about: '', cover_url: '', logo: '',
  whatsapp: '', facebook: '', instagram: '', website: '', email: '',
} as Record<PublicContactField, string>;

describe('Public-page tabs refactor', () => {
  it('أ) Tabs render 4 tabs with a11y roles', () => {
    const html = renderToStaticMarkup(<Tabs active="identity" onChange={() => {}} />);
    expect(html).toContain('role="tablist"');
    expect((html.match(/role="tab"/g) || []).length).toBe(4);
    expect(html).toContain('aria-controls="panel-identity"');
    expect(html).toContain('الهوية');
    expect(html).toContain('المظهر');
    expect(html).toContain('المحتوى');
    expect(html).toContain('المشاركة');
  });

  it('ب) ShareTab has links + QR + subdomain', () => {
    const html = renderToStaticMarkup(
      <ShareTab config={config} provisioning={false} onEnsureSubdomain={() => {}} onCopyLink={() => {}} onDownloadQr={() => {}} />
    );
    expect(html).toContain('مشاهدة الصفحة العامة');
    expect(html).toContain('نسخ الرابط');
    expect(html).toContain('تنزيل رمز QR');
    expect(html).toContain('النطاق الخاص بالعيادة');
  });

  it('ج) IdentityTab has form + save button', () => {
    const html = renderToStaticMarkup(
      <IdentityTab config={config} form={infoForm} setForm={() => {}} contactError={null} saving={false} onSaveInfo={() => {}} update={async () => true} load={noop} />
    );
    expect(html).toContain('الهوية والنبذة');
    expect(html).toContain('حفظ الهوية');
    expect(html).toContain('إظهار رقم الهاتف');
  });

  it('د) AppearanceTab has sizes + cover/news', () => {
    const html = renderToStaticMarkup(
      <AppearanceTab config={config} update={async () => true} load={noop} />
    );
    expect(html).toContain('مقاسات العرض');
    expect(html).toContain('الغلاف وشريط الأخبار');
  });

  it('هـ) ContentTab has contact + sections + services + providers', () => {
    const html = renderToStaticMarkup(
      <ContentTab config={config} form={contactForm} setForm={() => {}} update={async () => true}
        toggleSection={() => {}} toggleService={() => {}} toggleProvider={() => {}} />
    );
    expect(html).toContain('روابط التواصل');
    expect(html).toContain('أقسام الصفحة');
    expect(html).toContain('الخدمات');
    expect(html).toContain('مقدمو الخدمة');
    expect(html).toContain('تنظيف');
    expect(html).toContain('د. أحمد');
  });
});
