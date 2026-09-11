import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getAllLandingSections, LANDING_SECTION_KEYS, landingSectionLabel } from '@/lib/services/landingContent';
import { logEvent } from '@/lib/server/logging';

/** GET /api/admin/landing-page — every landing section with its DB override. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  try {
    const rows = await getAllLandingSections();
    const byKey = new Map(rows.map((r) => [r.section_key, r]));
    const sections = LANDING_SECTION_KEYS.map((key) => {
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
