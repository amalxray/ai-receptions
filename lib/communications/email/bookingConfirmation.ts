import { getEmailProvider } from './provider';
import { logEvent } from '@/lib/server/logging';

type BookingConfirmationEmailParams = {
  clinicId: string;
  appointmentId: string;
  to: string | null | undefined;
  clinicName: string;
  patientName: string;
  service: string;
  date: string;
  time: string;
};

/** Sends a booking receipt without allowing mail-provider failures to undo a booking. */
export async function sendBookingConfirmationEmail(params: BookingConfirmationEmailParams): Promise<boolean> {
  const email = params.to?.trim();
  if (!email) return false;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logEvent('booking_confirmation_email_skipped', {
      clinic_id: params.clinicId,
      appointment_id: params.appointmentId,
      reason: 'invalid_email',
    }, 'warn');
    return false;
  }

  let providerName = 'unknown';
  try {
    const provider = getEmailProvider();
    providerName = provider.name;
    if (provider.name === 'noop') {
      logEvent('booking_confirmation_email_skipped', {
        clinic_id: params.clinicId,
        appointment_id: params.appointmentId,
        reason: 'email_provider_not_configured',
      }, 'warn');
      return false;
    }

    const message = {
      to: email,
      subject: `استلام طلب حجزك — ${params.clinicName}`,
      text: [
        `مرحباً ${params.patientName}،`,
        '',
        `استلمنا طلب حجزك لدى ${params.clinicName}.`,
        `رقم الحجز: ${params.appointmentId}`,
        `الخدمة: ${params.service}`,
        `التاريخ: ${params.date}`,
        `الوقت: ${params.time}`,
        '',
        'ستتواصل معك العيادة لتأكيد الموعد.',
      ].join('\n'),
    };

    await provider.send(message);
    logEvent('booking_confirmation_email_sent', {
      clinic_id: params.clinicId,
      appointment_id: params.appointmentId,
      provider: providerName,
    });
    return true;
  } catch (error) {
    logEvent('booking_confirmation_email_failure', {
      clinic_id: params.clinicId,
      appointment_id: params.appointmentId,
      provider: providerName,
      error: error instanceof Error ? error.message : 'Unknown email error',
    }, 'error');
    return false;
  }
}
