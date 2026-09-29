import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import {
  rescheduleAppointment,
  RescheduleError,
  RESCHEDULE_HTTP_STATUS,
  RESCHEDULE_USER_MESSAGE,
} from '@/lib/services/appointmentReschedule';
import { logEvent } from '@/lib/server/logging';

const rescheduleSchema = z.object({
  appointment_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM'),
  /**
   * B52-B — optional provider change from the edit panel. Validated as a UUID
   * here, then re-validated by the service against the clinic, the service
   * assignment, the provider schedule and the slot unique index — so a raw
   * provider id can never bypass availability.
   */
  provider_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
  }

  try {

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const body = await req.json();
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reschedule payload', details: parsed.error.errors }, { status: 400 });
    }

    const updated = await rescheduleAppointment({
      clinicId,
      appointmentId: parsed.data.appointment_id,
      date: parsed.data.date,
      time: parsed.data.time,
      providerId: parsed.data.provider_id ?? null,
    });

    logEvent('appointment_reschedule_api', {
      clinic_id: clinicId,
      appointment_id: parsed.data.appointment_id,
      status: updated.status,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // B52 — typed business failure → its own status + Arabic, actionable copy.
    // Before this, "…no provider assigned…" (walk-in/legacy rows) and
    // "Provider not found…" matched none of the string checks below and reached
    // the receptionist as a bare `500 Internal server error`.
    if (err instanceof RescheduleError) {
      const status = RESCHEDULE_HTTP_STATUS[err.code] ?? 500;
      logEvent(
        'appointment_reschedule_rejected',
        { clinic_id: clinicId, error_code: err.code, detail: message },
        status >= 500 ? 'error' : 'warn',
      );
      return NextResponse.json(
        { error: RESCHEDULE_USER_MESSAGE[err.code], error_code: err.code },
        { status },
      );
    }

    // Legacy safety net for anything thrown outside the service contract.
    if (message.includes('Appointment not found')) {
      return NextResponse.json({ error: 'Appointment not found for this clinic' }, { status: 404 });
    }
    if (message.includes('cannot be rescheduled')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('unavailable') || message.includes('just booked')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('not assigned')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    logEvent('appointment_reschedule_api_error', { clinic_id: clinicId, error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}