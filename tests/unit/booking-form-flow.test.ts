import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/booking/route';

const mocks = vi.hoisted(() => ({
  findOrCreatePatient: vi.fn(),
  createBooking: vi.fn(),
  getChatBookingPolicy: vi.fn(),
  createInAppNotification: vi.fn(),
  getClinicSlugById: vi.fn(),
  getClinicSubscriptionAccess: vi.fn(),
  queueGoogleCalendarSync: vi.fn(),
  syncGoogleCalendarAppointment: vi.fn(),
}));

vi.mock('@/lib/services/bookingService', () => ({
  findOrCreatePatient: mocks.findOrCreatePatient,
  createBooking: mocks.createBooking,
  isValidBookingPhone: (value: unknown) => typeof value === 'string' && /^\+?[0-9()\s-]{5,30}$/.test(value),
}));
vi.mock('@/lib/ai/chatBookingPolicy', () => ({ getChatBookingPolicy: mocks.getChatBookingPolicy }));
vi.mock('@/lib/services/googleCalendarSync', () => ({
  queueGoogleCalendarSync: mocks.queueGoogleCalendarSync,
  syncGoogleCalendarAppointment: mocks.syncGoogleCalendarAppointment,
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/notifications/inAppNotifier', () => ({ createInAppNotification: mocks.createInAppNotification }));
vi.mock('@/lib/services/dashboardPaths', () => ({ tenantDashboardUrl: () => '/dashboard/test/appointments' }));
vi.mock('@/lib/services/tenantAccess', () => ({ getClinicSlugById: mocks.getClinicSlugById }));
vi.mock('@/lib/subscription/access', () => ({
  EXPIRED_TRIAL_MESSAGE: 'subscription expired',
  getClinicSubscriptionAccess: mocks.getClinicSubscriptionAccess,
}));

const clinicId = '11111111-1111-4111-8111-111111111111';
const providerId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOrCreatePatient.mockResolvedValue('patient-1');
  mocks.createBooking.mockResolvedValue({
    id: 'appointment-1',
    scheduled_at: '2026-10-28T10:00:00.000Z',
    status: 'tentative',
    booking_token: 'booking-token',
  });
  mocks.getChatBookingPolicy.mockResolvedValue({ createGoogleCalendarEvent: false });
  mocks.createInAppNotification.mockResolvedValue(undefined);
  mocks.getClinicSlugById.mockResolvedValue('amal-x-ray-center');
  mocks.getClinicSubscriptionAccess.mockResolvedValue({ allowed: true });
});

describe('quick booking form submission', () => {
  it.each(['بانوراما', 'CBCT'])('persists the patient-entered name and keeps %s pending', async (service) => {
    const response = await POST(new Request('http://localhost/api/booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicId,
        provider_id: providerId,
        service,
        date: '2026-10-28',
        time: '10:00',
        patient_name: 'سارة أحمد',
        phone: '0598547854',
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data).toMatchObject({ service, status: 'tentative' });
    expect(mocks.findOrCreatePatient).toHaveBeenCalledWith({
      clinicId,
      name: 'سارة أحمد',
      phone: '0598547854',
      email: null,
    });
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      clinicId,
      providerId,
      service,
      patientId: 'patient-1',
    }));
    expect(mocks.queueGoogleCalendarSync).not.toHaveBeenCalled();
    expect(mocks.syncGoogleCalendarAppointment).not.toHaveBeenCalled();
  });
});
