import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { listRows, createRow } from '@/lib/services/platformContent';

const schema = z.object({
  patient_name: z.string().min(1).max(200),
  patient_age: z.number().int().min(0).max(130).optional().nullable(),
  patient_city: z.string().max(100).optional().nullable(),
  content: z.string().min(1),
  image_url: z.string().min(1).max(1000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    return NextResponse.json({ data: await listRows('platform_stories', 'sort_order') });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
    return NextResponse.json({ data: await createRow('platform_stories', parsed.data as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
