import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  gate: { ok: true, status: 200 },
  prospectResult: {
    data: { clinic_name: 'عيادة النور' } as null | { clinic_name: string },
    error: null as null | { message: string },
  },
  regenerate: vi.fn(),
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => state.gate),
}));

vi.mock('@/lib/services/marketing/marketing-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/marketing/marketing-agent')>();
  return { ...actual, regenerateProspectEmail: state.regenerate };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => state.prospectResult),
      };
      return query;
    }),
  },
}));

import { PUT } from '@/app/api/admin/prospects/[id]/send-email/route';
import { ProspectEmailRegenerateError } from '@/lib/services/marketing/marketing-agent';

function requestWithBody(body: string): Request {
  return new Request('http://localhost/api/admin/prospects/prospect-id/send-email', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('admin prospect email regeneration API', () => {
  beforeEach(() => {
    state.gate = { ok: true, status: 200 };
    state.prospectResult = { data: { clinic_name: 'عيادة النور' }, error: null };
    state.regenerate.mockReset().mockResolvedValue({
      subject: 'عنوان جديد',
      body: 'نص جديد',
    });
  });

  it('loads the clinic and returns the regenerated email', async () => {
    const response = await PUT(requestWithBody(JSON.stringify({
      instructions: 'اختصر الرسالة',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    })), { params: { id: 'prospect-id' } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subject: 'عنوان جديد',
      body: 'نص جديد',
    });
    expect(state.regenerate).toHaveBeenCalledWith({
      clinicName: 'عيادة النور',
      instructions: 'اختصر الرسالة',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    });
  });

  it('rejects invalid input without calling AI', async () => {
    const response = await PUT(requestWithBody(JSON.stringify({
      instructions: ' ',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    })), { params: { id: 'prospect-id' } });

    expect(response.status).toBe(400);
    expect(state.regenerate).not.toHaveBeenCalled();
  });

  it('requires platform-admin authorization', async () => {
    state.gate = { ok: false, status: 403 };
    const response = await PUT(requestWithBody('{}'), { params: { id: 'prospect-id' } });

    expect(response.status).toBe(403);
    expect(state.regenerate).not.toHaveBeenCalled();
  });

  it('returns 404 when the prospect does not exist', async () => {
    state.prospectResult = { data: null, error: null };
    const response = await PUT(requestWithBody(JSON.stringify({
      instructions: 'اختصر الرسالة',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    })), { params: { id: 'missing-id' } });

    expect(response.status).toBe(404);
    expect(state.regenerate).not.toHaveBeenCalled();
  });

  it('returns 502 and provider_failed code for provider errors', async () => {
    state.regenerate.mockRejectedValueOnce(
      new ProspectEmailRegenerateError('provider_failed', 'provider unavailable'),
    );
    const response = await PUT(requestWithBody(JSON.stringify({
      instructions: 'اختصر الرسالة',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    })), { params: { id: 'prospect-id' } });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'provider_failed' });
  });

  it('returns 504 and timeout code for provider timeouts', async () => {
    state.regenerate.mockRejectedValueOnce(
      new ProspectEmailRegenerateError('timeout', 'provider timed out'),
    );
    const response = await PUT(requestWithBody(JSON.stringify({
      instructions: 'اختصر الرسالة',
      currentSubject: 'العنوان الحالي',
      currentBody: 'النص الحالي',
    })), { params: { id: 'prospect-id' } });

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ code: 'timeout' });
  });
});
