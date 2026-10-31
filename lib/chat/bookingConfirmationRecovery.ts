export type BookingConfirmationResult = {
  appointment_id: string;
  service: string;
  appointment_date: string;
  patient_name: string;
  clinic_name: string;
  clinic_phone: string | null;
};

export const BOOKING_CONFIRMED_REPLY =
  'تم تسجيل موعدك في قاعدة بيانات العيادة وهو بانتظار تأكيد العيادة.';

export function isBookingConfirmedReply(text: string): boolean {
  return text.trim() === BOOKING_CONFIRMED_REPLY;
}

function isBookingConfirmationResult(value: unknown): value is BookingConfirmationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.appointment_id === 'string' &&
    typeof result.service === 'string' &&
    typeof result.appointment_date === 'string' &&
    typeof result.patient_name === 'string' &&
    typeof result.clinic_name === 'string' &&
    (typeof result.clinic_phone === 'string' || result.clinic_phone === null)
  );
}

export async function recoverBookingConfirmation(
  clinicId: string,
  conversationId: string,
): Promise<BookingConfirmationResult | null> {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(clinicId);
  const params = new URLSearchParams({
    conversation_id: conversationId,
    [isUuid ? 'clinic_id' : 'clinic_slug']: clinicId,
  });
  const response = await fetch(`/api/public/ai/messages?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Booking confirmation lookup failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('booking_confirmation_result' in payload)) {
    throw new Error('Booking confirmation lookup returned an invalid response');
  }

  const result = payload.booking_confirmation_result;
  if (result === null) return null;
  if (!isBookingConfirmationResult(result)) {
    throw new Error('Booking confirmation lookup returned invalid booking details');
  }

  return result;
}
