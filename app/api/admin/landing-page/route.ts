import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getAllLandingSections, getLandingPageOrder, LANDING_SECTION_KEYS, landingSectionLabel, saveLandingPageOrder } from '@/lib/services/landingContent';
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
        is_visible: row?.is_visible ?? true,
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 });
    }

    const parsed = z.object({ order: z.array(z.string().trim().min(1)).min(1).max(LANDING_SECTION_KEYS.length) }).strict().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'order يجب أن يكون مصفوفة غير فارغة من مفاتيح الأقسام النصية', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
        { status: 400 },
      );
    }
    const unknownKeys = Array.from(new Set(parsed.data.order.filter((key) => !LANDING_SECTION_KEYS.includes(key as (typeof LANDING_SECTION_KEYS)[number]))));
    if (unknownKeys.length > 0) {
      return NextResponse.json({ error: `مفاتيح أقسام غير معروفة: ${unknownKeys.join(', ')}` }, { status: 400 });
    }

    await saveLandingPageOrder(parsed.data.order);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    logEvent('admin_landing_page_put_error', { error: detail }, 'error');
    return NextResponse.json({ error: 'تعذر حفظ ترتيب الصفحة الرئيسية', detail }, { status: 500 });
  }
}
