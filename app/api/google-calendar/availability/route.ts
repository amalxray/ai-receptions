import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAvailability } from '@/lib/services/googleCalendarBooking';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().optional().default('UTC'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid availability payload', details: parsed.error.errors }, { status: 400 });
    }

    const result = await checkAvailability(parsed.data.date, parsed.data.timezone);
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 501 });
  }
}
