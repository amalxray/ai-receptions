import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bookAppointment } from '@/lib/services/googleCalendarBooking';

const schema = z.object({
  patient_name: z.string().trim().min(2).max(200),
  patient_phone: z.string().trim().min(5).max(30),
  appointment_time: z.string().datetime(),
  timezone: z.string().optional().default('UTC'),
  duration_minutes: z.coerce.number().int().min(15).max(480).optional().default(30),
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional().default('pending'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid booking payload', details: parsed.error.errors }, { status: 400 });
    }

    const result = await bookAppointment({
      patient_name: parsed.data.patient_name,
      patient_phone: parsed.data.patient_phone,
      appointment_time: parsed.data.appointment_time,
      timezone: parsed.data.timezone,
      duration_minutes: parsed.data.duration_minutes,
      status: parsed.data.status,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const statusCode = message.includes('not configured') || message.includes('not configured yet') ? 501 : 409;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
