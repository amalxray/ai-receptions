import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  DATA_ROLES,
} from '@/lib/services/clinicAuthorization';
import { checkAvailability } from '@/lib/services/googleCalendarBooking';
import { logEvent } from '@/lib/server/logging';

const schema = z.object({
  clinic_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().optional().default('UTC'),
});

export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid availability payload' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, parsed.data.clinic_id);
    if (!authorization.authorized || roleDenied(authorization, DATA_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const result = await checkAvailability(
      parsed.data.clinic_id,
      parsed.data.date,
      parsed.data.timezone
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logEvent('google_calendar_availability_error', { error: message }, 'error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
