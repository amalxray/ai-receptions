import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolvePublicClinic: vi.fn(),
  createConversation: vi.fn(),
  getConversationById: vi.fn(),
  receivePatientMessage: vi.fn(),
  getSupabaseEnvConfig: vi.fn(),
  from: vi.fn(),
  loadClinicOperatingData: vi.fn(),
  loadReceptionistConversationState: vi.fn(),
}));

vi.mock('@/lib/services/clinics', () => ({
  resolvePublicClinic: mocks.resolvePublicClinic,
}));
vi.mock('@/lib/services/conversationService', () => ({
  createConversation: mocks.createConversation,
  getConversationById: mocks.getConversationById,
}));
vi.mock('@/lib/services/messageService', () => ({
  receivePatientMessage: mocks.receivePatientMessage,
}));
vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: mocks.getSupabaseEnvConfig,
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}));
vi.mock('@/lib/ai/clinicDataContext', () => ({
  loadClinicOperatingData: mocks.loadClinicOperatingData,
  loadReceptionistConversationState: mocks.loadReceptionistConversationState,
}));
vi.mock('@/lib/notifications/inAppNotifier', () => ({
  createInAppNotification: vi.fn(),
}));
vi.mock('@/lib/services/gateway/security/rate-limiter', () => ({
  RateLimiter: vi.fn(() => ({ isAllowed: () => true })),
  getClientId: () => 'test-client',
}));
vi.mock('@/lib/server/logging', () => ({
  logEvent: vi.fn(),
}));
vi.mock('@/lib/services/dashboardPaths', () => ({
  tenantDashboardUrl: () => '/dashboard/test/conversations',
}));

const clinic = { id: 'clinic-1', slug: 'test-clinic' };
const completeState = {
  state: 'BOOKING',
  recommended_service_id: 'service-1',
  recommended_provider_id: 'provider-1',
  patient_confirmed_booking: true,
  pending_question: '',
  booking: {
    service_id: null,
    provider_id: null,
    slot: '2026-10-12T10:00:00.000Z',
    patient_name: 'سارة أحمد',
    phone: '0599000000',
    email: null,
    appointment_id: null,
  },
};
const operatingData = {
  services: [{ id: 'service-1', name: 'تصوير بانوراما', duration_minutes: 30, active: true }],
  providers: [{ id: 'provider-1', name: 'أ. أمل' }],
  providerServiceIds: [{ service_id: 'service-1', provider_id: 'provider-1' }],
};

async function postMessage() {
  const { POST } = await import('@/app/api/public/ai/messages/route');
  return POST(new Request('https://example.test/api/public/ai/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clinic_slug: clinic.slug,
      conversation_id: 'conversation-1',
      text: 'أريد حجز موعد',
    }),
  }));
}

async function getMessages() {
  const { GET } = await import('@/app/api/public/ai/messages/route');
  return GET(new Request(
    `https://example.test/api/public/ai/messages?clinic_slug=${clinic.slug}&conversation_id=conversation-1`,
  ));
}

describe('public AI messages booking responses and history restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicClinic.mockResolvedValue(clinic);
    mocks.createConversation.mockResolvedValue({ id: 'conversation-1' });
    mocks.getConversationById.mockResolvedValue({
      id: 'conversation-1',
      clinic_id: clinic.id,
      metadata: { booking_intent: true, booking: { slot: completeState.booking.slot } },
      conversation_state: { state: 'BOOKING' },
    });
    mocks.receivePatientMessage.mockResolvedValue({
      userMessage: { id: 'user-1', role: 'patient', content: 'أريد حجز موعد' },
      assistantMessage: { id: 'assistant-1', role: 'assistant', content: 'ما رقم الهاتف؟' },
    });
    mocks.getSupabaseEnvConfig.mockReturnValue({ isConfigured: true });
    mocks.loadReceptionistConversationState.mockResolvedValue(completeState);
    mocks.loadClinicOperatingData.mockResolvedValue(operatingData);
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [
        { id: 'user-1', role: 'patient', content: 'أريد حجز موعد' },
        { id: 'assistant-1', role: 'assistant', content: 'ما رقم الهاتف؟' },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);
  });

  it('POST returns the booking confirmation card when all verified details are available', async () => {
    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toContain('تأكيد الحجز');
    expect(payload.interactive.booking_confirmation).toMatchObject({
      type: 'booking_confirmation',
      data: {
        service_id: 'service-1',
        provider_id: 'provider-1',
        patient_name: 'سارة أحمد',
      },
      actions: ['confirm', 'edit'],
    });
  });

  it('POST asks for the patient name when a pending booking is missing it', async () => {
    mocks.loadReceptionistConversationState.mockResolvedValue({
      ...completeState,
      booking: { ...completeState.booking, patient_name: null },
    });

    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toBe('ما الاسم الكامل للمريض/ة؟');
    expect(payload.interactive.booking_confirmation).toBeUndefined();
  });

  it('POST asks for the phone number when the patient name is present but phone is missing', async () => {
    mocks.loadReceptionistConversationState.mockResolvedValue({
      ...completeState,
      booking: { ...completeState.booking, phone: null },
    });

    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toBe('ما رقم الهاتف للتواصل؟');
    expect(payload.interactive.booking_confirmation).toBeUndefined();
  });

  it('POST does not claim a booking was saved when its response contains an unverified claim', async () => {
    mocks.loadReceptionistConversationState.mockResolvedValue(null);
    mocks.receivePatientMessage.mockResolvedValue({
      userMessage: { id: 'user-1', role: 'patient', content: 'أريد حجز موعد' },
      assistantMessage: { id: 'assistant-1', role: 'assistant', content: 'تم حجز موعدك بنجاح' },
    });

    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toContain('لم يتم تأكيد الحجز بعد');
    expect(payload.assistant_message.content).toContain('زر «تأكيد الحجز»');
  });

  it('POST strips source citations from the patient-facing assistant response', async () => {
    mocks.loadReceptionistConversationState.mockResolvedValue(null);
    mocks.receivePatientMessage.mockResolvedValue({
      userMessage: { id: 'user-1', role: 'patient', content: 'ما هي ساعات الدوام؟' },
      assistantMessage: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'نفتح الساعة التاسعة. [Source: clinic-hours.pdf, ID: doc-1, Chunk: 2]',
      },
    });

    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toBe('نفتح الساعة التاسعة.');
    expect(payload.assistant_message.content).not.toContain('[Source:');
  });

  it('POST returns an explicit failure message when complete details cannot form a valid confirmation card', async () => {
    mocks.loadClinicOperatingData.mockResolvedValue({
      services: [],
      providers: [],
      providerServiceIds: [],
    });

    const response = await postMessage();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistant_message.content).toContain('تعذر تجهيز بطاقة تأكيد الموعد');
    expect(payload.assistant_message.content).toContain('لم يتم إنشاء الحجز');
    expect(payload.interactive.booking_confirmation).toBeUndefined();
  });

  it('GET restores the latest assistant prompt for a pending booking', async () => {
    mocks.loadReceptionistConversationState.mockResolvedValue({
      ...completeState,
      booking: { ...completeState.booking, patient_name: null },
    });
    const response = await getMessages();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[1].content).toBe('ما الاسم الكامل للمريض/ة؟');
    expect(payload.data[0].content).toBe('أريد حجز موعد');
    expect(payload.booking_context).toBeDefined();
  });

  it('GET strips source citations from restored assistant messages', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [
        { id: 'user-1', role: 'patient', content: 'ما هي ساعات الدوام؟' },
        { id: 'assistant-1', role: 'assistant', content: 'نفتح الساعة التاسعة. [Source: hours.txt, ID: doc-2, Chunk: 1]' },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);
    mocks.loadReceptionistConversationState.mockResolvedValue(null);

    const response = await getMessages();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[1].content).toBe('نفتح الساعة التاسعة.');
    expect(payload.data[1].content).not.toContain('[Source:');
  });

  it('GET restores the confirmation-card prompt when booking details are complete', async () => {
    const response = await getMessages();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[1].content).toContain('تأكيد الحجز');
    expect(payload.interactive.booking_confirmation).toMatchObject({
      type: 'booking_confirmation',
      actions: ['confirm', 'edit'],
    });
  });

  it('GET restores the failure prompt when complete details cannot form a confirmation card', async () => {
    mocks.loadClinicOperatingData.mockResolvedValue({
      services: [],
      providers: [],
      providerServiceIds: [],
    });

    const response = await getMessages();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[1].content).toContain('تعذر تجهيز بطاقة تأكيد الموعد');
    expect(payload.data[1].content).toContain('لم يتم إنشاء الحجز');
    expect(payload.interactive.booking_confirmation).toBeUndefined();
  });

  it('GET reports a history-load failure instead of returning a success-shaped transcript', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    mocks.from.mockReturnValue(query);

    const response = await getMessages();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe('Failed to load conversation history');
    expect(payload.error).not.toContain('database unavailable');
  });
});
