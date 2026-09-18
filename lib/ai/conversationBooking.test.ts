/**
 * UNIFIED SAVE PATH — regression tests for the chat booking execution.
 *
 * Live evidence this guards against (Amal X-Ray Center, 2026-09-18):
 *   - the public "اطلب خدمة" button saved the appointment
 *     (f1556b13-…, scheduled_at "2026-09-17T11:50:00+00:00", conversation_id null)
 *   - the SAME clinic + patient through the chat saved NOTHING, while the model
 *     answered «تم تثبيت موعدك».
 *
 * Both entry points already share `findOrCreatePatient` + `createBooking`; these
 * tests lock in the remaining divergences that made the chat path fail:
 *   1. the service must be resolvable from the patient's own words (no LLM),
 *   2. date/time must use the SAME wall-clock-as-UTC convention the public path
 *      writes (no `timeZone` → no UTC shift in the dashboard/emails),
 *   3. a missing patient name must still degrade to `need_more_info` (never a
 *      half-written appointment).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attemptConversationBooking,
  matchServiceByName,
  missingBookingFields,
  parseSlot,
} from '@/lib/ai/conversationBooking';
import type { ClinicOperatingData } from '@/lib/ai/clinicDataContext';

const mocks = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: { metadata: {} }, error: null }));
  return {
    supabaseAdmin: { from: vi.fn(() => chain) },
    findOrCreatePatient: vi.fn(async (_params: Record<string, unknown>) => 'patient-1'),
    createBooking: vi.fn(async (_params: Record<string, unknown>) => ({
      id: 'appt-1',
      scheduled_at: '2026-09-19T09:00:00.000Z',
      status: 'tentative',
      booking_token: 'tok',
    })),
    isValidBookingPhone: vi.fn(
      (value: unknown) => typeof value === 'string' && /\d/.test(value) && value.trim().length >= 5
    ),
  };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.supabaseAdmin }));
vi.mock('@/lib/services/bookingService', () => ({
  findOrCreatePatient: mocks.findOrCreatePatient,
  createBooking: mocks.createBooking,
  isValidBookingPhone: mocks.isValidBookingPhone,
}));

const operatingData: ClinicOperatingData = {
  services: [
    {
      id: 'svc-panorama',
      name: 'تصوير بانوراما',
      description: null,
      duration_minutes: 5,
      pricing_type: 'fixed',
      price: 30,
      price_min: null,
      price_max: null,
      price_visible_to_patients: true,
      active: true,
    },
    {
      id: 'svc-cbct',
      name: 'تصوير طبقي  cbct',
      description: null,
      duration_minutes: 10,
      pricing_type: 'fixed',
      price: 60,
      price_min: null,
      price_max: null,
      price_visible_to_patients: true,
      active: true,
    },
  ],
  providers: [{ id: 'prov-1', name: 'أ. امل نوري', title: 'اخصائية الاشعة', provider_type: null }],
  providerServiceIds: [{ provider_id: 'prov-1', service_id: 'svc-panorama' }],
  hasServices: true,
  hasProviders: true,
  usable: true,
};

const baseBooking = {
  service_id: 'svc-panorama',
  provider_id: 'prov-1',
  slot: '2026-09-19T09:00:00.000Z',
  patient_name: 'طلال ابو جميل',
  phone: '0595000111',
  email: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createBooking.mockResolvedValue({
    id: 'appt-1',
    scheduled_at: '2026-09-19T09:00:00.000Z',
    status: 'tentative',
    booking_token: 'tok',
  });
});

describe('parseSlot', () => {
  it('reads the wall clock back out of the availability slot (no UTC shift)', () => {
    expect(parseSlot('2026-09-19T09:00:00.000Z')).toEqual(['2026-09-19', '09:00']);
    expect(parseSlot('2026-09-19T09:00')).toEqual(['2026-09-19', '09:00']);
  });
});

describe('missingBookingFields', () => {
  it('never blocks on the optional phone', () => {
    expect(missingBookingFields({ booking: { ...baseBooking, phone: null } })).toEqual([]);
  });

  it('reports the name when the patient never gave one', () => {
    expect(missingBookingFields({ booking: { ...baseBooking, patient_name: null } })).toEqual(['patient_name']);
  });
});

describe('matchServiceByName', () => {
describe('attemptConversationBooking', () => {
  it('does not run before the state machine reaches BOOKING', async () => {
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'INITIAL',
      patientConfirmedBooking: true,
      booking: baseBooking,
      operatingData,
    });
    expect(result).toEqual({ action: 'not_ready', state: 'INITIAL' });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('saves through the SAME createBooking the public path uses — wall-clock date/time, NO timeZone', async () => {
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: baseBooking,
      operatingData,
    });

    expect(result.action).toBe('booked');
    expect(mocks.findOrCreatePatient).toHaveBeenCalledWith({
      clinicId: 'clinic-1',
      name: 'طلال ابو جميل',
      phone: '0595000111',
      email: null,
    });
    const params = mocks.createBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      clinicId: 'clinic-1',
      providerId: 'prov-1',
      service: 'تصوير بانوراما',
      serviceId: 'svc-panorama',
      patientId: 'patient-1',
      conversationId: 'conv-1',
      date: '2026-09-19',
      time: '09:00',
    });
    // The regression: a `timeZone` here stored 09:00 clinic-local as 06:00Z and
    // made every chat-originated appointment display 3h early in the dashboard.
    expect(params.timeZone).toBeUndefined();
  });

  it('resolves a service the model never pinned (service_id null) from the patient name hint', async () => {
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: { ...baseBooking, service_id: null },
      operatingData,
      serviceNameHint: 'بانوراما',
    });

    expect(result.action).toBe('booked');
    expect((mocks.createBooking.mock.calls[0][0] as Record<string, unknown>).serviceId).toBe('svc-panorama');
  });

  it('asks for the missing name instead of writing a partial appointment', async () => {
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: { ...baseBooking, patient_name: null },
      operatingData,
    });

    expect(result).toEqual({ action: 'need_more_info', missing: ['patient_name'] });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('degrades to slot_unavailable when the slot was taken concurrently', async () => {
    mocks.createBooking.mockRejectedValueOnce(new Error('Slot unavailable: overlap'));
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: baseBooking,
      operatingData,
    });
    expect(result).toEqual({ action: 'slot_unavailable', reason: 'Slot unavailable: overlap' });
  });

  it('refuses resources that do not belong to this clinic', async () => {
    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: { ...baseBooking, provider_id: 'prov-other-clinic' },
      operatingData,
    });
    expect(result).toEqual({ action: 'failed', reason: 'recommendation_out_of_clinic' });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('is idempotent — an existing appointment_id is never booked twice', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: { metadata: { booking: { appointment_id: 'appt-existing' } } },
      error: null,
    }));
    mocks.supabaseAdmin.from.mockReturnValueOnce(chain as never);

    const result = await attemptConversationBooking({
      clinicId: 'clinic-1',
      conversationId: 'conv-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      booking: baseBooking,
      operatingData,
    });
    expect(result).toEqual({ action: 'already_booked', appointment_id: 'appt-existing' });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });
});

  it('resolves the service the patient actually named ("بانوراما")', () => {
    expect(matchServiceByName('بانوراما', operatingData.services)?.id).toBe('svc-panorama');
    expect(matchServiceByName('تصوير بانوراما', operatingData.services)?.id).toBe('svc-panorama');
    expect(matchServiceByName('cbct', operatingData.services)?.id).toBe('svc-cbct');
  });

  it('never invents a service', () => {
    expect(matchServiceByName('قلب مفتوح', operatingData.services)).toBeUndefined();
    expect(matchServiceByName('', operatingData.services)).toBeUndefined();
  });
});
