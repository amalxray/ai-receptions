import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getLandingSection, upsertLandingSection } from '@/lib/services/landingContent';
import { logEvent } from '@/lib/server/logging';

const ALLOWED_KEYS = new Set([
  'hero', 'features', 'for_doctors', 'how_it_works', 'compare',
  'faq', 'testimonials', 'urgency_bar', 'seo', 'colors',
]);

/** GET /api/admin/landing-page/[key] — one section (null content = static default). */
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) return NextResponse.json({ error: 'قسم غير معروف' }, { status: 404 });

  try {
    const row = await getLandingSection(key);
    return NextResponse.json({ data: row });
  } catch (err) {
    logEvent('admin_landing_section_get_error', { key, error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}

/** PUT /api/admin/landing-page/[key] — body: { content: object } */
export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) return NextResponse.json({ error: 'قسم غير معروف' }, { status: 404 });

  try {
    const body = (await req.json()) as { content?: unknown };
    if (typeof body.content !== 'object' || body.content === null || Array.isArray(body.content)) {
      return NextResponse.json({ error: 'content يجب أن يكون كائن JSON' }, { status: 400 });
    }
    await upsertLandingSection(key, body.content, gate.admin.user_id);
    logEvent('admin_landing_section_updated', { key, by: gate.admin.email });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logEvent('admin_landing_section_put_error', { key, error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
