import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/clinic/public-content/route';
import { PATCH } from '@/app/api/clinic/public-content/[id]/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  permissionDenied: vi.fn(),
  listPublicContent: vi.fn(),
  createPublicContent: vi.fn(),
  updatePublicContent: vi.fn(),
  writeAuditLog: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  ADMIN_ROLES: ['owner', 'manager'],
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
}));
vi.mock('@/lib/services/permissionGate', () => ({ permissionDenied: mocks.permissionDenied }));
vi.mock('@/lib/services/clinicPublicContent', () => ({
  listPublicContent: mocks.listPublicContent,
  createPublicContent: mocks.createPublicContent,
  updatePublicContent: mocks.updatePublicContent,
  deletePublicContent: vi.fn(),
}));
vi.mock('@/lib/services/auditService', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeClinicRequest.mockResolvedValue({
    authorized: true,
    role: 'receptionist',
    user: { id: 'staff-user' },
  });
  mocks.permissionDenied.mockResolvedValue(null);
  mocks.listPublicContent.mockResolvedValue([]);
  mocks.createPublicContent.mockResolvedValue({ ok: true, item: { id: 'news-1' } });
  mocks.updatePublicContent.mockResolvedValue({ ok: true });
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe('/api/clinic/public-content permissions', () => {
  it('uses view_public_page for news ticker reads', async () => {
    const response = await GET(
      new Request(`http://localhost/api/clinic/public-content?clinic_id=${CLINIC}&type=news`),
    );

    expect(response.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      CLINIC,
      'view_public_page',
      expect.objectContaining({ allowedRoles: expect.any(Array) }),
    );
  });

  it('uses manage_public_page for writes and stops on a denied grant', async () => {
    mocks.permissionDenied.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const response = await POST(
      new Request(`http://localhost/api/clinic/public-content?clinic_id=${CLINIC}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'news', text: 'Clinic update' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      CLINIC,
      'manage_public_page',
      expect.objectContaining({ allowedRoles: expect.any(Array) }),
    );
    expect(mocks.createPublicContent).not.toHaveBeenCalled();
  });

  it('reads the POST body once and creates a news item', async () => {
    const request = new Request(`http://localhost/api/clinic/public-content?clinic_id=${CLINIC}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'news', text: 'New clinic update' }),
    });
    const jsonSpy = vi.spyOn(request, 'json');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createPublicContent).toHaveBeenCalledWith(CLINIC, 'news', {
      type: 'news',
      text: 'New clinic update',
    });
  });

  it('reads the PATCH body once and forwards its fields to the update service', async () => {
    const request = new Request(`http://localhost/api/clinic/public-content/news-1?clinic_id=${CLINIC}&type=news`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '22222222-2222-2222-2222-222222222222', text: 'Updated news' }),
    });
    const jsonSpy = vi.spyOn(request, 'json');
    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(
      expect.any(Request),
      CLINIC,
      'manage_public_page',
      expect.objectContaining({ allowedRoles: expect.any(Array) }),
    );
    expect(mocks.updatePublicContent).toHaveBeenCalledWith(
      CLINIC,
      'news',
      '22222222-2222-2222-2222-222222222222',
      { text: 'Updated news' },
    );
  });
});
