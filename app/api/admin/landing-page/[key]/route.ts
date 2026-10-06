import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { getLandingSection, upsertLandingSection } from '@/lib/services/landingContent';
import { logEvent } from '@/lib/server/logging';
import { faqContentSchema, featuresContentSchema, heroContentSchema, landingColorsContentSchema, landingSeoContentSchema, pricingContentSchema, testimonialsContentSchema, urgencyBarContentSchema } from '@/lib/landing/hero-schema';

const ALLOWED_KEYS = new Set([
  'hero', 'features', 'for_doctors', 'how_it_works', 'compare',
  'faq', 'pricing', 'testimonials', 'cta', 'footer', 'urgency_bar', 'seo', 'colors',
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
    const body = (await req.json()) as { content?: unknown; is_visible?: boolean };
    const isVisible = typeof body.is_visible === 'boolean' ? body.is_visible : undefined;
    if (body.content !== undefined && body.content !== null && (typeof body.content !== 'object' || Array.isArray(body.content))) {
      return NextResponse.json({ error: 'content يجب أن يكون كائن JSON' }, { status: 400 });
    }
    let content = body.content === undefined || body.content === null ? null : body.content as Record<string, unknown>;
    const contentSchemas = {
      hero: heroContentSchema,
      features: featuresContentSchema,
      faq: faqContentSchema,
      testimonials: testimonialsContentSchema,
      pricing: pricingContentSchema,
      urgency_bar: urgencyBarContentSchema,
      colors: landingColorsContentSchema,
      seo: landingSeoContentSchema,
    } as const;
    const schema = contentSchemas[key as keyof typeof contentSchemas];
    if (schema) {
      const parsed = schema.safeParse(body.content);
      if (!parsed.success) {
        return NextResponse.json(
          { error: `بيانات قسم ${key} غير صالحة`, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
          { status: 400 },
        );
      }
      content = parsed.data as Record<string, unknown>;
    }

    if (content !== null || isVisible !== undefined) {
      await upsertLandingSection(key, content, gate.admin.user_id, isVisible);
    }
    revalidatePath('/');
    logEvent('admin_landing_section_updated', { key, by: gate.admin.email, is_visible: isVisible });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logEvent('admin_landing_section_put_error', { key, error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
