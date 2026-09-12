import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED_KEYS = new Set(['hero', 'colors', 'sections', 'questions', 'search_config']);
const putSchema = z.object({ key: z.string(), value: z.record(z.string(), z.unknown()) });

/** GET /api/admin/ask-settings — all /ask settings. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const { data, error } = await supabaseAdmin.from('platform_ask_settings').select('key, value').order('key');
    if (error) throw new Error(error.message);
    const out: Record<string, unknown> = {};
    for (const row of data ?? []) out[row.key] = row.value;
    return NextResponse.json({ data: out });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

/** PUT /api/admin/ask-settings — upsert one allowed key. */
export async function PUT(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  try {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success || !ALLOWED_KEYS.has(parsed.data.key)) {
      return NextResponse.json({ error: 'Invalid payload or unknown key' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('platform_ask_settings').upsert(
      { key: parsed.data.key, value: parsed.data.value as Record<string, unknown> },
      { onConflict: 'key' }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}