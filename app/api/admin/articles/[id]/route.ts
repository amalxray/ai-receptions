import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getRow, updateRow, deleteRow } from '@/lib/services/platformContent';
import { z } from 'zod';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug: z.string().trim().min(1).max(150).nullable().optional(),
  excerpt: z.string().max(900).nullable().optional(),
  content: z.string().min(1),
  featured_image_id: z.string().uuid().nullable().optional(),
  featured_image_url: z.string().url().max(1000).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().max(40)).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']),
  published_at: z.string().nullable().optional(),
  is_featured: z.boolean(),
}).strict();

/** /api/admin/articles/[id] — get / update / delete a article. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const row = await getRow('platform_articles', params.id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
    const row = await updateRow('platform_articles', params.id, parsed.data);
    return NextResponse.json({ data: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    await deleteRow('platform_articles', params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
