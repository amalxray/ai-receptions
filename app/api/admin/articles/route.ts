import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { listRows, createRow } from '@/lib/services/platformContent';

const schema = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().min(1).max(150).optional().nullable(),
  excerpt: z.string().max(900).optional().nullable(),
  content: z.string().min(1),
  featured_image_id: z.string().uuid().optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  tags: z.array(z.string().max(40)).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  published_at: z.string().optional().nullable(),
  is_featured: z.boolean().default(false),
});

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    return NextResponse.json({ data: await listRows('platform_articles', 'published_at') });
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
    const data = parsed.data as Record<string, unknown>;
    if (!data.slug) data.slug = `article-${Date.now().toString(36)}`;
    if (data.status === 'published' && !data.published_at) data.published_at = new Date().toISOString();
    return NextResponse.json({ data: await createRow('platform_articles', data) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
