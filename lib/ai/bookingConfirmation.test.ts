import { describe, expect, it } from 'vitest';
import { buildBookingConfirmation } from '@/lib/ai/bookingConfirmation';
import type { ClinicOperatingData, ReceptionistConversationState } from '@/lib/ai/clinicDataContext';

const operatingData: ClinicOperatingData = {
  services: [{
    id: 'service-1',
    name: 'تنظيف الأسنان والفحص',
    description: null,
    duration_minutes: 30,
    pricing_type: 'fixed',
    price: 0,
    price_min: null,
    price_max: null,
    price_visible_to_patients: true,
    active: true,
  }],
  providers: [{ id: 'provider-1', name: 'د. حلا', title: 'طبيبة أسنان', provider_type: null }],
  providerServiceIds: [{ service_id: 'service-1', provider_id: 'provider-1' }],
  hasServices: true,
  hasProviders: true,
  usable: true,
};

const completeState: ReceptionistConversationState = {
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
  },
};

describe('buildBookingConfirmation', () => {
  it('creates a capsule only from complete clinic-scoped booking data', () => {
    expect(buildBookingConfirmation({ slug: 'hala-clinic' }, completeState, operatingData)).toMatchObject({
      type: 'booking_confirmation',
      actions: ['confirm', 'edit'],
      data: {
        clinic: 'hala-clinic',
        service: 'تنظيف الأسنان والفحص',
        provider: 'د. حلا',
        date: '2026-10-10',
        time: '16:00',
        patient_name: 'هادي جاد الله',
        phone: '056000111',
      },
    });
  });

  it('does not expose incomplete, unassigned, handed-off, or already-booked requests', () => {
    expect(buildBookingConfirmation({ slug: 'hala-clinic' }, {
      ...completeState,
      booking: { ...completeState.booking, phone: null },
    }, operatingData)).toBeNull();
    expect(buildBookingConfirmation({ slug: 'hala-clinic' }, {
      ...completeState,
      booking: { ...completeState.booking, appointment_id: 'appointment-1' },
    }, operatingData)).toBeNull();
    expect(buildBookingConfirmation({ slug: 'hala-clinic' }, {
      ...completeState,
      state: 'awaiting_staff',
    }, operatingData)).toBeNull();
  });
});
