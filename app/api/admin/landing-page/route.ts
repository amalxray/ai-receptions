import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getAllLandingSections, getLandingPageOrder, landingSectionLabel, saveLandingPageOrder } from '@/lib/services/landingContent';
import { logEvent } from '@/lib/server/logging';

/** GET /api/admin/landing-page — every landing section with its DB override. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  try {
    const [rows, orderedKeys] = await Promise.all([getAllLandingSections(), getLandingPageOrder()]);
    const byKey = new Map(rows.map((r) => [r.section_key, r]));
    const sections = orderedKeys.map((key) => {
      const row = byKey.get(key);
      return {
        section_key: key,
        label: landingSectionLabel(key),
        content: row?.content ?? null,
        updated_at: row?.updated_at ?? null,
      };
    });
    return NextResponse.json({ data: sections });
  } catch (err) {
    logEvent('admin_landing_page_get_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}

/** PUT /api/admin/landing-page — save visual order of the landing sections. */
export async function PUT(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  try {
    const body = (await req.json()) as { order?: unknown };
    if (!Array.isArray(body.order)) {
      return NextResponse.json({ error: 'order يجب أن يكون مصفوفة من section_key' }, { status: 400 });
    }

    await saveLandingPageOrder(body.order.filter((item): item is string => typeof item === 'string'));
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logEvent('admin_landing_page_put_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
