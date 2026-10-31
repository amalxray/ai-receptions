import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolvePublicClinic: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  clinicActivityType: 'clinic' as 'clinic' | 'imaging_center' | 'dental_lab',
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}));
vi.mock('@/lib/services/clinics', () => ({
  resolvePublicClinic: mocks.resolvePublicClinic,
}));
vi.mock('@/lib/communications/email/bookingConfirmation', () => ({
  sendBookingConfirmationEmail: mocks.sendBookingConfirmationEmail,
}));

import { GET, POST } from './route';

const clinicId = '11111111-1111-1111-1111-111111111111';
const serviceId = '22222222-2222-2222-2222-222222222222';
const appointmentId = '33333333-3333-3333-3333-333333333333';
const service = { id: serviceId, name: 'تنظيف الأسنان', duration_minutes: 45 };

function request(body: unknown): Request {
  return new Request('http://localhost/api/public/book-quick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clinicActivityType = 'clinic';
  mocks.resolvePublicClinic.mockResolvedValue({
    id: clinicId,
    slug: 'test-clinic',
    name: 'عيادة الاختبار',
    phone: null,
  });
  mocks.sendBookingConfirmationEmail.mockResolvedValue(true);
  mocks.from.mockImplementation((table: string) => {
    const chain: Record<string, any> = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: table === 'clinics' ? { activity_type: mocks.clinicActivityType } : service,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: table === 'appointments' ? { id: appointmentId } : null,
        error: null,
      })),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [{ scheduled_at: '2026-10-31T10:30:00.000Z' }],
          error: null,
        }).then(resolve, reject),
    };
    return chain;
  });
});

describe('public quick booking', () => {
  it('stores the selected clinic service and scheduled slot on the appointment', async () => {
    const response = await POST(request({
      clinicId,
      serviceId,
      activityType: 'clinic',
      name: 'Test Patient',
      phone: '+972501234567',
      date: '2026-10-31',
      time: '10:30',
    }));

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('clinics');
    expect(mocks.from).toHaveBeenCalledWith('clinic_services');
    expect(mocks.from).toHaveBeenCalledWith('appointments');
    const serviceQuery = mocks.from.mock.results.find((_result, index) =>
      mocks.from.mock.calls[index][0] === 'clinic_services',
    )?.value;
    expect(serviceQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    const appointmentsQuery = mocks.from.mock.results.find((_result, index) =>
      mocks.from.mock.calls[index][0] === 'appointments',
    )?.value;
    expect(appointmentsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      clinic_id: clinicId,
      service: service.name,
      service_id: serviceId,
      duration_minutes: 45,
      appointment_date: '2026-10-31',
      scheduled_at: '2026-10-31T10:30:00.000Z',
      source: 'web-quick',
    }));
    expect(mocks.sendBookingConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({
      service: service.name,
    }));
  });

  it('rejects invalid calendar dates before making database calls', async () => {
    const response = await POST(request({
      clinicId,
      serviceId,
      activityType: 'clinic',
      name: 'Test Patient',
      phone: '+972501234567',
      date: '2026-02-31',
      time: '10:30',
    }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.resolvePublicClinic).not.toHaveBeenCalled();
  });

  it('stores imaging services as text without writing a non-clinic service id', async () => {
    mocks.clinicActivityType = 'imaging_center';
    const response = await POST(request({
      clinicId,
      serviceId,
      activityType: 'imaging_center',
      name: 'Test Patient',
      phone: '+972501234567',
      date: '2026-10-31',
      time: '10:30',
    }));

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('imaging_services');
    const appointmentsQuery = mocks.from.mock.results.find((_result, index) =>
      mocks.from.mock.calls[index][0] === 'appointments',
    )?.value;
    expect(appointmentsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      service: service.name,
      service_id: null,
    }));
  });

  it('returns booked times from scheduled_at for the resolved clinic', async () => {
    const response = await GET(new Request(
      `http://localhost/api/public/book-quick?clinic_id=${clinicId}&date=2026-10-31`,
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bookedTimes: ['10:30'] });
    expect(mocks.resolvePublicClinic).toHaveBeenCalledWith({ id: clinicId });
  });
});
