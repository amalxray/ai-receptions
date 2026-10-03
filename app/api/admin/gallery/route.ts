import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { listRows, createRow } from '@/lib/services/platformContent';

const scopeSchema = z.enum(['main_site', 'ask_page']);

const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  image_url: z.string().min(1).max(1000),
  category: z.string().max(60).optional().nullable(),
  tags: z.array(z.string().max(40)).optional().nullable(),
  scope: scopeSchema.default('main_site'),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const url = new URL(req.url);
    const scope = scopeSchema.catch('main_site').parse(url.searchParams.get('scope') ?? 'main_site');
    const { data } = await (await import('@/lib/supabase/admin')).supabaseAdmin
      .from('platform_gallery')
      .select('*')
      .eq('scope', scope)
      .order('sort_order', { ascending: true })
      .limit(200);
    return NextResponse.json({ data: data ?? [] });
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
    return NextResponse.json({ data: await createRow('platform_gallery', parsed.data as Record<string, unknown>) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
