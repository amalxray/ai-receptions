import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { runNearbyClinics } from '@/lib/services/askContent';

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(1).max(200).default(50),
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

/** GET /api/public/clinics/nearby?lat=&lng=&radius=&limit= — nearest clinics. */
export async function GET(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    const { searchParams } = new URL(req.url);
    const parsed = query.safeParse({
      lat: searchParams.get('lat'),
      lng: searchParams.get('lng'),
      radius: searchParams.get('radius') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query', details: parsed.error.errors }, { status: 400 });
    const data = await runNearbyClinics(parsed.data.lat, parsed.data.lng, parsed.data.radius, parsed.data.limit);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 });
  }
}
