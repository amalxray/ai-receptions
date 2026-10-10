import type { BookingConfirmation } from './chatInteractive';
import type { ClinicOperatingData, ClinicProfile, ReceptionistConversationState } from './clinicDataContext';

export function buildBookingConfirmation(
  clinic: Pick<ClinicProfile, 'slug'>,
  state: ReceptionistConversationState | null,
  operatingData: ClinicOperatingData,
): BookingConfirmation | null {
  if (
    !state ||
    state.state === 'awaiting_staff' ||
    state.state === 'assigned_staff' ||
    state.booking.appointment_id
  ) return null;

  const { service_id, provider_id, slot, patient_name, phone } = state.booking;
  if (!service_id || !provider_id || !slot || !patient_name?.trim() || !phone?.trim()) return null;

  const service = operatingData.services.find((item) => item.id === service_id && item.active);
  const provider = operatingData.providers.find((item) => item.id === provider_id);
  if (!service || !provider) return null;
  if (operatingData.providerServiceIds.length > 0 && !operatingData.providerServiceIds.some(
    (assignment) => assignment.service_id === service_id && assignment.provider_id === provider_id,
  )) return null;

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slot);
  if (!match) return null;

  return {
    type: 'booking_confirmation',
    data: {
      clinic: clinic.slug,
      service: service.name,
      service_id: service.id,
      provider: provider.name,
      provider_id: provider.id,
      date: match[1],
      time: match[2],
      patient_name: patient_name.trim(),
      phone: phone.trim(),
      service_options: operatingData.services
        .filter((item) => item.active)
        .map((item) => ({ id: item.id, name: item.name })),
      provider_options: operatingData.providers.map((item) => ({ id: item.id, name: item.name })),
    },
    actions: ['confirm', 'edit'],
  };
}
