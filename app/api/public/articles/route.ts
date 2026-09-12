import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { listPublishedArticles } from '@/lib/services/askContent';

const query = z.object({
  category: z.string().max(60).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/public/articles?category=&limit=&offset= — published articles. */
export async function GET(req: Request) {
  const rl = rateLimit(clientIp(req));
  const retryAfter = rl.ok ? 60 : rl.retryAfterSeconds;
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { searchParams } = new URL(req.url);
    const parsed = query.safeParse({
      category: searchParams.get('category'),
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query', details: parsed.error.errors }, { status: 400 });
    const data = await listPublishedArticles(parsed.data);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
