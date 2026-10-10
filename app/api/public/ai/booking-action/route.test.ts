import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  attemptConversationBooking: vi.fn(),
  getConversationById: vi.fn(),
  loadClinicOperatingData: vi.fn(),
  loadClinicProfile: vi.fn(),
  loadReceptionistConversationState: vi.fn(),
  persistReceptionistSlot: vi.fn(),
  resolvePublicClinic: vi.fn(),
  saveMessage: vi.fn(),
}));

vi.mock('@/lib/ai/conversationBooking', () => ({
  attemptConversationBooking: mocks.attemptConversationBooking,
}));
vi.mock('@/lib/ai/clinicDataContext', () => ({
  loadClinicOperatingData: mocks.loadClinicOperatingData,
  loadClinicProfile: mocks.loadClinicProfile,
  loadReceptionistConversationState: mocks.loadReceptionistConversationState,
  persistReceptionistSlot: mocks.persistReceptionistSlot,
}));
vi.mock('@/lib/services/clinics', () => ({ resolvePublicClinic: mocks.resolvePublicClinic }));
vi.mock('@/lib/services/conversationService', () => ({ getConversationById: mocks.getConversationById }));
vi.mock('@/lib/services/messageService', () => ({ saveMessage: mocks.saveMessage }));
vi.mock('@/lib/services/bookingService', () => ({
  getAvailableSlots: vi.fn(),
  isValidBookingPhone: (value: unknown) => typeof value === 'string' && /^\d{5,30}$/.test(value),
}));
vi.mock('@/lib/ai/chatBookingPolicy', () => ({
  getChatBookingPolicy: () => ({ createGoogleCalendarEvent: false }),
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/services/gateway/security/rate-limiter', () => ({
  RateLimiter: class {
    isAllowed() { return true; }
  },
  getClientId: () => 'test-client',
}));

const clinic = { id: 'clinic-1', slug: 'hala-clinic' };
const state = {
  state: 'BOOKING',
  recommended_service_id: 'service-1',
  recommended_provider_id: 'provider-1',
  patient_confirmed_booking: false,
  pending_question: '',
  booking: {
    service_id: 'service-1',
    provider_id: 'provider-1',
    slot: '2026-10-10T16:00:00.000Z',
    patient_name: 'هادي جاد الله',
    phone: '056000111',
    email: null,
    appointment_id: null as string | null,
    appointment_status: null as string | null,
    scheduled_at: null as string | null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.booking.appointment_id = null;
  state.booking.appointment_status = null;
  state.booking.scheduled_at = null;
  state.patient_confirmed_booking = false;
  mocks.resolvePublicClinic.mockResolvedValue(clinic);
  mocks.getConversationById.mockResolvedValue({ id: 'conversation-1' });
  mocks.loadReceptionistConversationState.mockImplementation(async () => state);
  mocks.loadClinicProfile.mockResolvedValue({ name: 'عيادة حلا', activityType: 'clinic', timezone: 'Asia/Hebron' });
  mocks.loadClinicOperatingData.mockResolvedValue({
    services: [{
      id: 'service-1', name: 'تنظيف الأسنان والفحص', active: true, duration_minutes: 30,
    }],
    providers: [{ id: 'provider-1', name: 'د. حلا' }],
    providerServiceIds: [{ service_id: 'service-1', provider_id: 'provider-1' }],
  });
  mocks.persistReceptionistSlot.mockImplementation(async (_clinicId: string, _conversationId: string, fields: Record<string, unknown>) => {
    if (fields.patient_confirmed_booking !== undefined) state.patient_confirmed_booking = fields.patient_confirmed_booking as boolean;
    if (fields.appointment_id !== undefined) state.booking.appointment_id = fields.appointment_id as string;
    if (fields.appointment_status !== undefined) state.booking.appointment_status = fields.appointment_status as string;
    if (fields.scheduled_at !== undefined) state.booking.scheduled_at = fields.scheduled_at as string;
  });
  mocks.attemptConversationBooking.mockResolvedValue({
    action: 'booked',
    appointment: { id: 'appointment-1', status: 'pending_confirmation', scheduled_at: '2026-10-10T16:00:00.000Z' },
  });
  mocks.saveMessage.mockResolvedValue({ id: 'message-1' });
});

describe('public chat booking action', () => {
  it('creates the booking only on explicit confirmation and persists pending status without Google', async () => {
    const request = new Request('http://localhost/api/public/ai/booking-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clinic_slug: 'hala-clinic',
        conversation_id: 'conversation-1',
        action: 'confirm',
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, status: 'pending_confirmation', appointment_id: 'appointment-1' });
    expect(mocks.attemptConversationBooking).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic-1',
      state: 'BOOKING',
      patientConfirmedBooking: true,
      googleCalendar: false,
      requirePhone: true,
    }));
    expect(mocks.persistReceptionistSlot).toHaveBeenCalledWith('clinic-1', 'conversation-1', expect.objectContaining({
      appointment_id: 'appointment-1',
      appointment_status: 'pending_confirmation',
      state: 'COMPLETED',
    }));
  });
});
