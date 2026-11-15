import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPermission = vi.hoisted(() => ({ permissionDenied: vi.fn() }));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mockPermission.permissionDenied,
}));

const mockLeads = vi.hoisted(() => ({
  getLeads: vi.fn(),
  createLead: vi.fn(),
  createPublicLead: vi.fn(),
}));
vi.mock('@/lib/services/leads', () => mockLeads);

vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({ isConfigured: true }),
}));
vi.mock('@/lib/demoState', () => ({
  demoFallbackAllowed: () => false,
}));

import { GET, POST } from '@/app/api/leads/route';

describe('lead API permission gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires view_leads before listing clinic leads', async () => {
    mockPermission.permissionDenied.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await GET(new Request('https://app.test/api/leads?clinic_id=clinic-1'));

    expect(response.status).toBe(403);
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      'clinic-1',
      'view_leads',
    );
    expect(mockLeads.getLeads).not.toHaveBeenCalled();
  });

  it('requires manage_leads before creating a clinic lead', async () => {
    mockPermission.permissionDenied.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(new NextRequest('https://app.test/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: '11111111-1111-1111-1111-111111111111',
        name: 'Lead',
        email: '',
        phone: '0500000000',
        source: 'dashboard',
        status: 'new',
      }),
    }));

    expect(response.status).toBe(403);
    expect(mockPermission.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      '11111111-1111-1111-1111-111111111111',
      'manage_leads',
    );
    expect(mockLeads.createLead).not.toHaveBeenCalled();
  });
});
