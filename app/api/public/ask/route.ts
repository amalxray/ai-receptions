import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { answerAsk } from '@/lib/services/askAssistant';

// The reply waits on the AI provider (bounded retry + failover with backoff:
// up to 2 attempts per candidate and 1s→3s pauses). The platform default
// (~10s on serverless) can cut a legitimate generation short.
export const maxDuration = 30;

const bodySchema = z.object({
  message: z.string().min(1).max(1000),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), city: z.string().max(120).optional().nullable() })
    .nullable()
    .optional(),
  conversation_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/public/ask — platform triage chat (no auth, rate-limited).
 * Reply includes nearby clinic suggestions when the patient shared a location.
 */
export async function POST(req: Request) {
  const rl = rateLimit(clientIp(req));
  const retryAfter = rl.ok ? 60 : rl.retryAfterSeconds;
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'بيانات غير صحيحة', details: parsed.error.errors }, { status: 400 });
    const { message, location, conversation_id } = parsed.data;

    const reply = await answerAsk({
      message,
      location: location ? { lat: location.lat, lng: location.lng, city: location.city ?? null } : null,
    });

    // NOTE: the /ask chat keeps history client-side (conversation_id is
    // reserved for future persistence); no writes to clinic-scoped tables.
    return NextResponse.json({ ...reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع', detail: message }, { status: 500 });
  }
}
