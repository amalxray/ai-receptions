import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPermission = vi.hoisted(() => ({ permissionDenied: vi.fn() }));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mockPermission.permissionDenied,
}));

const mockMessaging = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getAcceptedPartners: vi.fn(),
  sendMessage: vi.fn(),
  assertCanMessage: vi.fn(),
}));
vi.mock('@/lib/services/clinicMessaging', () => mockMessaging);

import { GET, POST } from '@/app/api/clinic/messages/route';

describe('clinic messaging permission gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires view_messages before listing conversations', async () => {
    mockPermission.permissionDenied.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await GET(new Request('https://app.test/api/clinic/messages?clinic_id=clinic-1'));

    expect(response.status).toBe(403);
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      'clinic-1',
      'view_messages',
    );
    expect(mockMessaging.getConversations).not.toHaveBeenCalled();
  });

  it('requires send_messages before sending a message', async () => {
    mockPermission.permissionDenied.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(new Request('https://app.test/api/clinic/messages?clinic_id=clinic-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_clinic_id: 'clinic-2', content: 'hello' }),
    }));

    expect(response.status).toBe(403);
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      'clinic-1',
      'send_messages',
    );
    expect(mockMessaging.sendMessage).not.toHaveBeenCalled();
  });
});
