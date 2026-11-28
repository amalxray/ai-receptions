import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/providers/registry', () => ({
  ensureAIProviders: vi.fn(),
}));

vi.mock('@/lib/ai/resilience', () => ({
  generateWithFailover: vi.fn(),
}));

import { ensureAIProviders } from '@/lib/ai/providers/registry';
import { generateWithFailover } from '@/lib/ai/resilience';
import {
  buildImagingCenterEmail,
  generateBlogArticle,
  generateFollowUpEmail1,
  generateFollowUpEmail2,
  generateLinkedInPost,
  regenerateProspectEmail,
  generateSalesEmail,
} from '@/lib/services/marketing/marketing-agent';
import { PLATFORM_LINKS, PLATFORM_LINKS_ARABIC_BLOCK } from '@/lib/communications/platformLinks';
import { DEFAULT_WHATSAPP_MESSAGE } from '@/lib/communications/whatsappTemplates';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateWithFailover).mockResolvedValue({
    text: ' محتوى تسويقي تجريبي ',
    providerId: 'openai',
  });
});

describe('marketing agent', () => {
  it('generates LinkedIn content through the provider registry with Dentairec context', async () => {
    await expect(generateLinkedInPost('إدارة المكالمات', 'أطباء الأسنان'))
      .resolves.toBe('محتوى تسويقي تجريبي');

    expect(ensureAIProviders).toHaveBeenCalledOnce();
    expect(generateWithFailover).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('30–38%'),
    }));
    expect(vi.mocked(generateWithFailover).mock.calls[0][0].prompt)
      .toContain('أطباء الأسنان');
  });

  it('returns the complete clinic-management sales email without placeholders', async () => {
    const email = await generateSalesEmail('عيادة النور', 'د. سارة', 'متابعة بعد التواصل');

    expect(email).toContain('مرحباً فريق عيادة النور،');
    expect(email).toContain('نظام إدارة عيادات متكامل');
    expect(email).toContain('🩻 تحليل الأشعة بالذكاء الاصطناعي');
    expect(email).toContain('👥 إدارة الفريق والرواتب');
    expect(email).toContain('info@dentairec.com');
    expect(email).toContain('واتساب: +970569509093');
    expect(email).not.toMatch(/\[[^\]]+\]/);
    expect(generateWithFailover).not.toHaveBeenCalled();
  });

  it('keeps all five platform links in the shared links block and WhatsApp template', () => {
    const links = [
      PLATFORM_LINKS.home,
      PLATFORM_LINKS.ask,
      PLATFORM_LINKS.discover,
      PLATFORM_LINKS.showcaseImaging,
      PLATFORM_LINKS.whatsapp,
    ];

    expect(PLATFORM_LINKS_ARABIC_BLOCK.match(/https:\/\//g)).toHaveLength(5);
    for (const link of links) {
      expect(PLATFORM_LINKS_ARABIC_BLOCK).toContain(link);
      expect(DEFAULT_WHATSAPP_MESSAGE).toContain(link);
    }
  });

  it('adds the shared links block once to each email template', async () => {
    const emails = [
      await generateSalesEmail('عيادة النور', 'د. سارة', 'متابعة بعد التواصل'),
      generateFollowUpEmail1('عيادة النور', 'https://example.test/unsubscribe/token'),
      generateFollowUpEmail2('عيادة النور', 'https://example.test/unsubscribe/token'),
      buildImagingCenterEmail('عيادة الاختبار'),
    ];

    for (const email of emails) {
      expect(email).toContain(PLATFORM_LINKS_ARABIC_BLOCK);
      expect(email.split(PLATFORM_LINKS.showcaseImaging)).toHaveLength(2);
      expect(email).toContain('https://wa.me/970569509093');
    }
  });

  it('creates an imaging-center email with the requested service details', () => {
    const email = buildImagingCenterEmail('عيادة الاختبار');

    expect(email).toContain('مرحباً فريق عيادة الاختبار،');
    expect(email).toContain('تصوير CBCT ثلاثي الأبعاد');
    expect(email).toContain('DICOM');
    expect(email).toContain('amal-x-ray-center.dentairec.com');
  });

  it('regenerates a prospect email using Groq-preferred failover and parses fenced JSON', async () => {
    vi.mocked(generateWithFailover).mockResolvedValueOnce({
      text: '```json\n{"subject":"عنوان جديد","body":"نص جديد"}\n```',
      providerId: 'groq',
    });

    await expect(regenerateProspectEmail({
      clinicName: 'عيادة النور',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
      instructions: 'اجعل الرسالة أقصر',
    })).resolves.toEqual({ subject: 'عنوان جديد', body: 'نص جديد' });

    expect(ensureAIProviders).toHaveBeenCalledOnce();
    expect(generateWithFailover).toHaveBeenCalledWith(expect.objectContaining({
      preferredProviderId: 'groq',
      prompt: expect.stringContaining('عيادة النور'),
    }));
    expect(vi.mocked(generateWithFailover).mock.calls[0][0].prompt)
      .toContain('اجعل الرسالة أقصر');
  });

  it('rejects malformed AI JSON instead of returning a success-shaped draft', async () => {
    vi.mocked(generateWithFailover).mockResolvedValueOnce({
      text: 'ليس JSON صالحاً',
      providerId: 'groq',
    });

    await expect(regenerateProspectEmail({
      clinicName: 'عيادة النور',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
      instructions: 'اختصر',
    })).rejects.toThrow('تعذّر تحليل استجابة AI');
  });

  it('generates a blog article for the requested topic', async () => {
    await generateBlogArticle('تجربة المريض في العيادات');

    expect(vi.mocked(generateWithFailover).mock.calls[0][0].prompt)
      .toContain('تجربة المريض في العيادات');
  });

  it('rejects empty input and empty provider responses', async () => {
    await expect(generateBlogArticle('  ')).rejects.toThrow('topic must not be empty');

    vi.mocked(generateWithFailover).mockResolvedValue({ text: '  ', providerId: 'openai' });
    await expect(generateBlogArticle('التسويق للعيادات'))
      .rejects.toThrow('The AI provider returned empty marketing content');
  });
});
