import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  checkAvailability: vi.fn(),
  getClinicGoogleCalendarClient: vi.fn(),
}));

vi.mock('@/lib/services/googleCalendarBooking', () => ({
  checkAvailability: mocks.checkAvailability,
}));

vi.mock('@/lib/services/googleCalendarOAuth', () => ({
  getClinicGoogleCalendarClient: mocks.getClinicGoogleCalendarClient,
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
  roleDenied: (authorization: { authorized: boolean; status?: number; role?: string }, allowedRoles: string[]) => {
    if (!authorization.authorized) {
      return { authorized: false, status: authorization.status ?? 401 };
    }
    if (!allowedRoles.includes(authorization.role ?? '')) {
      return { authorized: false, status: 403 };
    }
    return null;
  },
}));

describe('POST /api/google-calendar/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAvailability.mockResolvedValue({ date: '2026-10-11', available: true, slots: [] });
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: true, role: 'doctor' });
  });

  it('rejects anonymous requests before accessing calendar data', async () => {
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });

    const response = await POST(new Request('http://localhost/api/google-calendar/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: '00000000-0000-4000-8000-000000000001',
        provider_id: '00000000-0000-4000-8000-000000000002',
        date: '2026-10-11',
      }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.getClinicGoogleCalendarClient).not.toHaveBeenCalled();
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('rejects a user from clinic A requesting clinic B availability', async () => {
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const request = new Request('http://localhost/api/google-calendar/availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer clinic-a-session',
      },
      body: JSON.stringify({
        clinic_id: '00000000-0000-4000-8000-000000000001',
        provider_id: '00000000-0000-4000-8000-000000000002',
        date: '2026-10-11',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.authorizeClinicRequest).toHaveBeenCalledWith(
      request,
      '00000000-0000-4000-8000-000000000001',
    );
    expect(mocks.getClinicGoogleCalendarClient).not.toHaveBeenCalled();
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('rejects availability requests for a clinic without a connected calendar', async () => {
    mocks.getClinicGoogleCalendarClient.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/google-calendar/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: '00000000-0000-4000-8000-000000000001',
        provider_id: '00000000-0000-4000-8000-000000000002',
        date: '2026-10-11',
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Google Calendar is not connected for this clinic.',
    });
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('returns availability for the connected clinic calendar', async () => {
    mocks.getClinicGoogleCalendarClient.mockResolvedValue({
      flushTokenPersistence: vi.fn().mockResolvedValue(undefined),
    });

    const response = await POST(new Request('http://localhost/api/google-calendar/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: '00000000-0000-4000-8000-000000000001',
        provider_id: '00000000-0000-4000-8000-000000000002',
        date: '2026-10-11',
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '2026-10-11',
      'Asia/Hebron',
    );
  });
});
