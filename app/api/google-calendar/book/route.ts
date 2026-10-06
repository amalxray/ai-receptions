import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
} from '@/lib/services/clinicAuthorization';
import {
  bookAppointment,
  type GoogleCalendarBookingDetails,
} from '@/lib/services/googleCalendarBooking';
import { logEvent } from '@/lib/server/logging';

const schema = z.object({
  clinic_id: z.string().uuid(),
  patient_name: z.string().trim().min(2).max(200),
  patient_phone: z.string().trim().min(5).max(30),
  service: z.string().trim().min(1).max(200),
  appointment_time: z.string().datetime(),
  timezone: z.string().optional().default('UTC'),
  duration_minutes: z.coerce.number().int().min(15).max(480).optional().default(30),
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional().default('pending'),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid booking payload' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, parsed.data.clinic_id);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const {
      clinic_id,
      patient_name,
      patient_phone,
      service,
      appointment_time,
      timezone,
      duration_minutes,
      status,
    } = parsed.data;
    if (!clinic_id || !patient_name || !patient_phone || !service || !appointment_time) {
      return NextResponse.json({ error: 'Invalid booking payload' }, { status: 400 });
    }

    const booking: GoogleCalendarBookingDetails = {
      clinic_id,
      patient_name,
      patient_phone,
      service,
      appointment_time,
      timezone,
      duration_minutes,
      status,
    };
    const result = await bookAppointment(booking);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logEvent('google_calendar_booking_error', { error: message }, 'error');
    const status = /calendar id/i.test(message) ? 501 : /already reserved/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
