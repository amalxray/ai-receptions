export const preferredRegion = 'icn1';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveServiceById, getAvailableSlots, loadProviderSchedule } from '@/lib/services/bookingService';
import { getGoogleCalendarBusyIntervals, type GoogleCalendarBusyInterval } from '@/lib/services/googleCalendarBooking';
import { logEvent } from '@/lib/server/logging';

const availabilitySchema = z.object({
  clinic_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  service_id: z.string().uuid().optional(),
  // A full working day (9:00–20:00) with short imaging services (5–15 min)
  // spans well over a hundred slots — the old max=20 truncated the day to its
  // first hour. Return the whole day by default.
  limit: z.coerce.number().int().min(1).max(200).optional().default(200),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = availabilitySchema.safeParse({
      clinic_id: url.searchParams.get('clinic_id'),
      provider_id: url.searchParams.get('provider_id'),
      date: url.searchParams.get('date'),
      service_id: url.searchParams.get('service_id') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }

    const { clinic_id, provider_id, date, service_id, limit } = parsed.data;

    const slots = await getAvailableSlots(clinic_id, provider_id, date, limit, service_id);

    // Google busy filter — the form used to ignore the clinic's connected
    // calendar entirely (the chat path already filtered via availabilityTool).
    // Same overlap test as googleCalendarBooking.checkAvailability:
    //   slotStart < busyEnd && slotEnd > busyStart
    // A calendar failure/disconnect NEVER blocks availability — local slots
    // stay authoritative (Form keeps working with Google absent).
    let busy: GoogleCalendarBusyInterval[] = [];
    try {
      busy = await getGoogleCalendarBusyIntervals(clinic_id, date, 'Asia/Jerusalem');
    } catch (err) {
      logEvent('booking_availability_google_busy_error', {
        clinic_id,
        provider_id,
        date,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let filteredSlots = slots;
    if (busy.length > 0) {
      // Session duration — mirrors getAvailableSlots' own resolution:
      // service duration when service_id is given, else the provider default.
      const schedule = await loadProviderSchedule(clinic_id, provider_id);
      let durationMinutes = schedule?.appointmentDurationMinutes ?? 30;
      if (service_id) {
        const service = await getActiveServiceById(clinic_id, service_id);
        if (service) durationMinutes = service.duration_minutes;
      }
      filteredSlots = slots.filter((slot) => {
        const start = slot.slice(0, 16); // YYYY-MM-DDTHH:mm local key
        const endInstant = new Date(`${start}:00Z`);
        endInstant.setUTCMinutes(endInstant.getUTCMinutes() + durationMinutes);
        const end = endInstant.toISOString().slice(0, 16);
        return !busy.some((interval) => start < interval.end && end > interval.start);
      });
    }

    return NextResponse.json({ data: { clinic_id, provider_id, date, service_id: service_id ?? null, slots: filteredSlots } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('booking_availability_error', { error: message }, 'error');
    if (message.includes('Provider not found')) {
      return NextResponse.json({ error: 'Provider not found for this clinic' }, { status: 404 });
    }
    if (message.includes('Provider is not assigned to this service')) {
      return NextResponse.json({ error: 'Provider is not assigned to this service' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}