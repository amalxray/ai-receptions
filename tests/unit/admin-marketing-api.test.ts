import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  generateSalesEmail: vi.fn(),
  generateLinkedInPost: vi.fn(),
  generateBlogArticle: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

vi.mock('@/lib/services/marketing/marketing-agent', () => ({
  generateSalesEmail: mocks.generateSalesEmail,
  generateLinkedInPost: mocks.generateLinkedInPost,
  generateBlogArticle: mocks.generateBlogArticle,
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));

import { POST } from '@/app/api/admin/marketing/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/marketing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/marketing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: true });
    mocks.generateSalesEmail.mockResolvedValue('Email draft');
    mocks.generateLinkedInPost.mockResolvedValue('LinkedIn draft');
    mocks.generateBlogArticle.mockResolvedValue('Blog draft');
  });

  it('keeps the existing sales email request compatible', async () => {
    const response = await POST(request({
      clinicName: 'Al Noor Clinic',
      doctorName: 'Dr Noor',
      note: 'Follow up after the demo',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { content: 'Email draft', type: 'email' },
    });
    expect(mocks.generateSalesEmail).toHaveBeenCalledWith(
      'Al Noor Clinic',
      'Dr Noor',
      'Follow up after the demo',
    );
  });

  it('generates LinkedIn content for the selected audience', async () => {
    const response = await POST(request({
      type: 'linkedin',
      topic: 'Patient experience',
      audience: 'clinics',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { content: 'LinkedIn draft', type: 'linkedin', metadata: { audience: 'clinics' } },
    });
    expect(mocks.generateLinkedInPost).toHaveBeenCalledWith(
      'Patient experience',
      'عيادات الأسنان',
    );
  });

  it('generates a blog article from title, keywords, and requested length', async () => {
    const response = await POST(request({
      type: 'blog',
      title: 'Patient experience',
      keywords: 'dentistry, appointments',
      wordCount: 1000,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { content: 'Blog draft', type: 'blog', metadata: { wordCount: 1000 } },
    });
    expect(mocks.generateBlogArticle).toHaveBeenCalledWith(
      'العنوان: Patient experience\nالكلمات المفتاحية: dentistry, appointments\nالطول المستهدف: 1000 كلمة',
    );
  });

  it('rejects unsupported content types and invalid blog lengths', async () => {
    const invalidType = await POST(request({ type: 'video' }));
    const invalidLength = await POST(request({
      type: 'blog',
      title: 'Title',
      keywords: 'keyword',
      wordCount: 750,
    }));

    expect(invalidType.status).toBe(400);
    expect(invalidLength.status).toBe(400);
    expect(mocks.generateLinkedInPost).not.toHaveBeenCalled();
    expect(mocks.generateBlogArticle).not.toHaveBeenCalled();
  });

  it('requires platform admin authorization', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: false, status: 403 });

    const response = await POST(request({
      type: 'linkedin',
      topic: 'Topic',
      audience: 'clinics',
    }));

    expect(response.status).toBe(403);
    expect(mocks.generateLinkedInPost).not.toHaveBeenCalled();
  });
});
