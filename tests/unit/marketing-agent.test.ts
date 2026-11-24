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
  generateBlogArticle,
  generateLinkedInPost,
  generateSalesEmail,
} from '@/lib/services/marketing/marketing-agent';

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

  it('generates a personalized sales email using the provided details', async () => {
    await generateSalesEmail('عيادة النور', 'د. سارة', 'متابعة بعد التواصل');

    const prompt = vi.mocked(generateWithFailover).mock.calls[0][0].prompt;
    expect(prompt).toContain('عيادة النور');
    expect(prompt).toContain('د. سارة');
    expect(prompt).toContain('متابعة بعد التواصل');
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
