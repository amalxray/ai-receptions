import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { deleteCatalogService, updateCatalogService } from '@/lib/services/clinicServiceCatalog';
import { logEvent } from '@/lib/server/logging';

const PRICING_TYPES = ['unspecified', 'fixed', 'estimate', 'range', 'case_by_case'] as const;

const serviceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
  price: z.coerce.number().min(0).optional().nullable(),
  pricing_type: z.enum(PRICING_TYPES).optional(),
  price_min: z.coerce.number().min(0).optional().nullable(),
  price_max: z.coerce.number().min(0).optional().nullable(),
  price_visible_to_patients: z.boolean().optional(),
  active: z.boolean().optional(),
});

/**
 * B18 — ACTIVITY-AWARE: reads/writes the catalog owned by this tenant's
 * `activity_type` (imaging_services / lab_services / clinic_services) and keeps
 * the canonical clinic_services mirror in sync, so dashboard edits actually
 * reach the public space. See `lib/services/clinicServiceCatalog.ts`.
 */

export async function PUT(req: Request) {
  try {
    const { pathname, searchParams } = new URL(req.url);
    const serviceId = pathname.split('/').filter(Boolean).pop();
    const clinicId = searchParams.get('clinic_id');
    if (!serviceId) return NextResponse.json({ error: 'service_id is required' }, { status: 400 });
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const body = await req.json();
    const parsed = serviceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid service payload', details: parsed.error.errors }, { status: 400 });
    }

    const data = await updateCatalogService(clinicId, serviceId, parsed.data);

    logEvent('clinic_service_updated', { clinic_id: clinicId, service_id: serviceId });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SERVICE_NAME_TAKEN') {
      return NextResponse.json({ error: 'A service with this name already exists' }, { status: 409 });
    }
    logEvent('clinic_services_put_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { pathname, searchParams } = new URL(req.url);
    const serviceId = pathname.split('/').filter(Boolean).pop();
    const clinicId = searchParams.get('clinic_id');
    if (!serviceId) return NextResponse.json({ error: 'service_id is required' }, { status: 400 });
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const deleted = await deleteCatalogService(clinicId, serviceId);
    if (!deleted) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    logEvent('clinic_service_deleted', { clinic_id: clinicId, service_id: serviceId });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_services_delete_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}