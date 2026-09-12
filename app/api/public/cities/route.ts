import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { listActiveCities } from '@/lib/services/askContent';

export async function GET(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    return NextResponse.json({ data: await listActiveCities() });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
