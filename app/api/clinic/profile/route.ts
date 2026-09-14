import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

const profileSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  email: z.string().email().max(254).optional().nullable(),
  // Location (20261005_clinic_location columns) — optional; only written when sent.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  city: z.string().max(120).optional().nullable(),
  area: z.string().max(120).optional().nullable(),
  address_detail: z.string().max(500).optional().nullable(),
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

    const supabase = supabaseAdmin;
    const { data, error } = await supabase
      .from('clinics')
      .select('id, name, phone, address, address_detail, city, area, website, email, slug, latitude, longitude, created_at, updated_at')
      .eq('id', clinicId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_profile_get_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid profile payload', details: parsed.error.errors }, { status: 400 });
    }

    const supabase = supabaseAdmin;
    // Base fields are always written; location fields only when sent so a
    // plain profile edit never wipes previously set coordinates.
    const patch: Record<string, unknown> = {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      website: parsed.data.website ?? null,
      email: parsed.data.email ?? null,
    };
    if (parsed.data.latitude !== undefined) patch.latitude = parsed.data.latitude;
    if (parsed.data.longitude !== undefined) patch.longitude = parsed.data.longitude;
    if (parsed.data.city !== undefined) patch.city = parsed.data.city;
    if (parsed.data.area !== undefined) patch.area = parsed.data.area;
    if (parsed.data.address_detail !== undefined) patch.address_detail = parsed.data.address_detail;

    const { data, error } = await supabase
      .from('clinics')
      .update(patch)
      .eq('id', clinicId)
      .is('deleted_at', null)
      .select('id, name, phone, address, address_detail, city, area, website, email, slug, latitude, longitude, created_at, updated_at')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    logEvent('clinic_profile_updated', { clinic_id: clinicId });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_profile_put_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}