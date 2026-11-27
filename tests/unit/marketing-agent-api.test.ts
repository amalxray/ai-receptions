import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  generateLinkedInPost: vi.fn(),
  generateSalesEmail: vi.fn(),
  generateBlogArticle: vi.fn(),
  logEvent: vi.fn(),
  withEntitlement: vi.fn(async (_clinicId: string, _resource: string, generate: () => Promise<string>) => generate()),
  entitlementErrorResponse: vi.fn(() => null),
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
  roleDenied: (authorization: { authorized: boolean; status?: number }) =>
    authorization.authorized
      ? null
      : { authorized: false, status: authorization.status === 401 ? 401 : 403 },
}));

vi.mock('@/lib/services/marketing/marketing-agent', () => ({
  generateLinkedInPost: mocks.generateLinkedInPost,
  generateSalesEmail: mocks.generateSalesEmail,
  generateBlogArticle: mocks.generateBlogArticle,
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));
vi.mock('@/lib/subscription/entitlements', () => ({
  withEntitlement: mocks.withEntitlement,
  entitlementErrorResponse: mocks.entitlementErrorResponse,
}));

import { POST } from '@/app/api/agents/marketing/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/agents/marketing', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/agents/marketing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: true, role: 'owner' });
    mocks.generateLinkedInPost.mockResolvedValue('LinkedIn draft');
    mocks.generateSalesEmail.mockResolvedValue('Sales email draft');
    mocks.generateBlogArticle.mockResolvedValue('Blog article draft');
  });

  it('requires an authorized clinic membership before generating content', async () => {
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });

    const response = await POST(request({
      action: 'linkedin',
      clinic_id: 'clinic-1',
      topic: 'Topic',
      audience: 'Dentists',
    }));

    expect(response.status).toBe(401);
    expect(mocks.generateLinkedInPost).not.toHaveBeenCalled();
  });

  it('generates LinkedIn content for the authorized clinic', async () => {
    const response = await POST(request({
      action: 'linkedin',
      clinic_id: 'clinic-1',
      topic: 'Patient experience',
      audience: 'Dentists',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { content: 'LinkedIn draft' } });
    expect(mocks.generateLinkedInPost).toHaveBeenCalledWith('Patient experience', 'Dentists');
    expect(mocks.withEntitlement).toHaveBeenCalledWith('clinic-1', 'agent_runs', expect.any(Function));
  });

  it('generates a sales email from the submitted details', async () => {
    const response = await POST(request({
      action: 'sales_email',
      clinic_id: 'clinic-1',
      clinicName: 'Al Noor Clinic',
      doctorName: 'Dr Noor',
      note: 'Follow up after the demo',
    }));

    expect(response.status).toBe(200);
    expect(mocks.generateSalesEmail).toHaveBeenCalledWith(
      'Al Noor Clinic',
      'Dr Noor',
      'Follow up after the demo',
    );
  });

  it('generates a blog article for the submitted topic', async () => {
    const response = await POST(request({
      action: 'blog_article',
      clinic_id: 'clinic-1',
      topic: 'Patient experience',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { content: 'Blog article draft' } });
    expect(mocks.generateBlogArticle).toHaveBeenCalledWith('Patient experience');
  });

  it('rejects invalid generation input', async () => {
    const response = await POST(request({
      action: 'linkedin',
      clinic_id: 'clinic-1',
      topic: ' ',
      audience: 'Dentists',
    }));

    expect(response.status).toBe(400);
    expect(mocks.generateLinkedInPost).not.toHaveBeenCalled();
  });
});
