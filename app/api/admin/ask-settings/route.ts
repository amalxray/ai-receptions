import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseEnvConfig } from '@/lib/config';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

const ALLOWED_KEYS = new Set(['hero', 'colors', 'sections', 'sections_order', 'questions', 'search_config']);
const DEFAULT_SECTIONS_ORDER = [
  'hero',
  'quick_questions',
  'tips',
  'articles',
  'stories',
  'fun_facts',
  'faq',
  'cta',
  'gallery',
];

const putSchema = z.object({
  key: z.string(),
  value: z.unknown(),
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeSectionsOrder(settings: Record<string, unknown>): string[] {
  const currentOrder = settings.sections_order;
  if (Array.isArray(currentOrder) && currentOrder.every((section): section is string => typeof section === 'string')) {
    return currentOrder;
  }

  const legacySections = settings.sections;
  const legacyOrder = legacySections && typeof legacySections === 'object' && !Array.isArray(legacySections)
    ? Object.keys(legacySections)
    : [];
  return [...legacyOrder, ...DEFAULT_SECTIONS_ORDER.filter((section) => !legacyOrder.includes(section))];
}

function isValidSettingValue(key: string, value: unknown): boolean {
  if (key === 'sections_order' || key === 'questions') {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (key === 'sections') {
    return Object.values(value).every((entry) => typeof entry === 'boolean');
  }
  return true;
}

/** GET /api/admin/ask-settings — all /ask settings. */
export async function GET(req: Request) {
  try {
    if (!getSupabaseEnvConfig().isConfigured) {
      return NextResponse.json({ error: 'Supabase is not configured for this runtime.' }, { status: 503 });
    }

    const gate = await requirePlatformAdmin(req);
    if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

    const { data, error } = await supabaseAdmin.from('platform_ask_settings').select('key, value').order('key');
    if (error) throw new Error(error.message);
    const out: Record<string, unknown> = {};
    for (const row of data ?? []) out[row.key] = row.value;
    out.sections_order = normalizeSectionsOrder(out);
    return NextResponse.json({ data: out });
  } catch (err) {
    logEvent('admin_ask_settings_get_error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'error');
    console.error('[admin_ask_settings_get_error]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

/** PUT /api/admin/ask-settings — upsert one allowed key. */
export async function PUT(req: Request) {
  try {
    if (!getSupabaseEnvConfig().isConfigured) {
      return NextResponse.json({ error: 'Supabase is not configured for this runtime.' }, { status: 503 });
    }

    const gate = await requirePlatformAdmin(req);
    if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return NextResponse.json({ error: `Invalid payload (${detail})` }, { status: 400 });
    }

    if (!ALLOWED_KEYS.has(parsed.data.key)) {
      return NextResponse.json({ error: 'Invalid payload (unknown key)' }, { status: 400 });
    }

    if (!isValidSettingValue(parsed.data.key, parsed.data.value)) {
      return NextResponse.json({ error: `Invalid payload (${parsed.data.key}: invalid value shape)` }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('platform_ask_settings').upsert(
      { key: parsed.data.key, value: parsed.data.value },
      { onConflict: 'key' }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logEvent('admin_ask_settings_put_error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'error');
    console.error('[admin_ask_settings_put_error]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}