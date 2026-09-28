import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseEnvConfig } from '@/lib/config';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { toPatientShape } from '@/lib/services/patientShape';
import { deleteDemoPatient, getDemoPatients, updateDemoPatient } from '@/lib/demoState';

/** `patients.id` is a `uuid` column — see 20260721_initial_schema.sql. */
const PATIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * B37 — single-patient read.
 *
 * Before this handler existed, the patient detail page had no option but to call
 * `GET /api/patients` and `.find()` the row client-side. That list route caps its
 * result at the newest 50 patients (`app/api/patients/route.ts` → `.limit(50)`),
 * so every patient beyond the 50th newest rendered as "المريض غير موجود في هذه
 * العيادة" — a silent reachability cliff that grows with the clinic (amal-x-ray
 * center was already at 43/50). This handler is keyed by the patient id, so it
 * cannot inherit that cap.
 *
 * The row is always fetched with `clinic_id` in the WHERE clause: a patient that
 * exists under another tenant answers 404, never 200 and never "forbidden"
 * (which would leak existence across tenants).
 */
export async function GET(request: Request) {
  const { pathname, searchParams } = new URL(request.url);
  const patientId = pathname.split('/').filter(Boolean).pop();
  const clinicId = searchParams.get('clinic_id');

  if (!patientId) {
    return NextResponse.json({ error: 'Patient id is required' }, { status: 400 });
  }
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    const demo = getDemoPatients().find((patient) => patient.id === patientId && patient.clinic_id === clinicId);
    if (!demo) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    return NextResponse.json(demo);
  }

  const authorization = await authorizeClinicRequest(request, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
  }

  // Only checked after authorization: a malformed id must not reach Postgres as
  // a 22P02 "invalid input syntax for type uuid" (which surfaces as a 500), and
  // existence must never be disclosed to unauthenticated callers.
  if (!PATIENT_ID_PATTERN.test(patientId)) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }

  const supabase = supabaseAdmin;
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }

  return NextResponse.json(toPatientShape(data));
}

export async function PUT(request: Request) {
  const { pathname, searchParams } = new URL(request.url);
  const patientId = pathname.split('/').filter(Boolean).pop();
  const clinicId = searchParams.get('clinic_id');
  const body = await request.json();

  if (!patientId) {
    return NextResponse.json({ error: 'Patient id is required' }, { status: 400 });
  }
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    const existing = updateDemoPatient(patientId, {});
    const existingMeta = (existing?.metadata as Record<string, unknown> | undefined) ?? {};
    const mergedMeta = {
      ...existingMeta,
      source: body.source ?? existingMeta.source ?? 'موقع الويب',
      status: body.status ?? existingMeta.status ?? 'جديد',
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      ...(body.date_of_birth !== undefined ? { date_of_birth: body.date_of_birth } : {}),
    };

    const updated = updateDemoPatient(patientId, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      source: mergedMeta.source as string,
      status: mergedMeta.status as string,
      metadata: mergedMeta,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  const authorization = await authorizeClinicRequest(request, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
  }

  const supabase = supabaseAdmin;

  // Fetch current metadata to preserve existing fields
  const { data: currentPatient } = await supabase
    .from('patients')
    .select('metadata')
    .eq('id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  const existingMeta = (currentPatient?.metadata as Record<string, unknown> | undefined) ?? {};
  const mergedMeta = {
    ...existingMeta,
    source: body.source ?? existingMeta.source ?? 'موقع الويب',
    status: body.status ?? existingMeta.status ?? 'جديد',
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    ...(body.date_of_birth !== undefined ? { date_of_birth: body.date_of_birth } : {}),
  };

  const updateFields: Record<string, unknown> = {
    metadata: mergedMeta,
  };
  if (body.name !== undefined) updateFields.full_name = body.name;
  if (body.email !== undefined) updateFields.email = body.email;
  if (body.phone !== undefined) updateFields.phone_number = body.phone;
  if (body.notes !== undefined) updateFields.notes = body.notes;

  const { data, error } = await supabase.from('patients').update(updateFields).eq('id', patientId).eq('clinic_id', clinicId).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { pathname, searchParams } = new URL(request.url);
  const patientId = pathname.split('/').filter(Boolean).pop();
  const clinicId = searchParams.get('clinic_id');

  if (!patientId) {
    return NextResponse.json({ error: 'Patient id is required' }, { status: 400 });
  }
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    const deleted = deleteDemoPatient(patientId);
    if (!deleted) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  const authorization = await authorizeClinicRequest(request, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
  }

  const supabase = supabaseAdmin;
  const { error } = await supabase.from('patients').delete().eq('id', patientId).eq('clinic_id', clinicId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}