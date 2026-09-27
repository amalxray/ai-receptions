import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSupabaseEnvConfig } from '@/lib/config';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { deleteDemoPatient, updateDemoPatient } from '@/lib/demoState';

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