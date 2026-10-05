import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getRow, updateRow, deleteRow } from '@/lib/services/platformContent';
import { z } from 'zod';

const updateSchema = z.object({
  patient_name: z.string().trim().min(1).max(200),
  patient_age: z.number().int().min(0).max(130).nullable().optional(),
  patient_city: z.string().max(100).nullable().optional(),
  content: z.string().trim().min(1).max(5000),
  outcome: z.string().trim().min(1).max(1500),
  image_url: z.string().url().max(1000).nullable().optional(),
  before_image_url: z.string().url().max(1000),
  after_image_url: z.string().url().max(1000),
  provider_id: z.string().uuid().nullable().optional(),
  doctor_name: z.string().trim().min(1).max(200),
  specialty: z.string().trim().min(1).max(160),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0),
}).strict();

/** /api/admin/stories/[id] — get / update / delete a story. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const row = await getRow('platform_stories', params.id);
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
    const row = await updateRow('platform_stories', params.id, parsed.data);
    return NextResponse.json({ data: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    await deleteRow('platform_stories', params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
