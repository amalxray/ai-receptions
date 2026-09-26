import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { createCatalogService, listCatalogServices } from '@/lib/services/clinicServiceCatalog';
import { logEvent } from '@/lib/server/logging';

const PRICING_TYPES = ['unspecified', 'fixed', 'estimate', 'range', 'case_by_case'] as const;

/**
 * B18 — this endpoint is ACTIVITY-AWARE: it reads and writes the catalog that
 * belongs to `clinics.activity_type` (imaging_services for imaging centers,
 * lab_services for dental labs, clinic_services for clinics), so what the owner
 * edits in the dashboard is exactly what the public space renders. All routing
 * and the canonical clinic_services mirror live in
 * `lib/services/clinicServiceCatalog.ts`; this route keeps auth + validation.
 */
/** HTML forms submit numbers as strings; '' means "not provided" → null. */
const normalizeNumericInput = (body: Record<string, unknown>): Record<string, unknown> => {
  for (const key of ['price', 'price_min', 'price_max']) {
    if (body[key] === '') body[key] = null;
  }
  return body;
};

const serviceSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullish(),
    duration_minutes: z.coerce.number().int().min(5).max(480),
    price: z.coerce.number().min(0).nullish(),
    pricing_type: z.enum(PRICING_TYPES).optional(),
    price_min: z.coerce.number().min(0).nullish(),
    price_max: z.coerce.number().min(0).nullish(),
    price_visible_to_patients: z.boolean().optional(),
    active: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    if ((val.pricing_type ?? 'unspecified') === 'range' && val.price_min != null && val.price_max != null && val.price_min > val.price_max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price_max'], message: 'price_max must be >= price_min' });
    }
  });


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const data = await listCatalogServices(clinicId);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_services_get_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const roleGate = roleDenied(authorization, ADMIN_ROLES);
    if (roleGate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = normalizeNumericInput(await req.json());
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid service payload', details: parsed.error.errors }, { status: 400 });
    }

    const data = await createCatalogService(clinicId, parsed.data);

    logEvent('clinic_service_created', { clinic_id: clinicId, service_id: data.id });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_services_post_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}