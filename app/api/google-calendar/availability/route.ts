import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAvailability } from '@/lib/services/googleCalendarBooking';
import { getClinicGoogleCalendarClient } from '@/lib/services/googleCalendarOAuth';
import { authorizeClinicRequest, DATA_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';

const schema = z.object({
  clinic_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().optional().default('Asia/Hebron'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid availability payload', details: parsed.error.errors }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, parsed.data.clinic_id);
    const denied = roleDenied(authorization, DATA_ROLES);
    if (denied) {
      return NextResponse.json(
        { error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: denied.status },
      );
    }

    const calendarClient = await getClinicGoogleCalendarClient(parsed.data.clinic_id);
    if (!calendarClient) {
      return NextResponse.json(
        { error: 'Google Calendar is not connected for this clinic.' },
        { status: 409 },
      );
    }
    await calendarClient.flushTokenPersistence?.();

    const result = await checkAvailability(
      parsed.data.clinic_id,
      parsed.data.provider_id,
      parsed.data.date,
      parsed.data.timezone,
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
