import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, ADMIN_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { validateIanaTimezone } from '@/lib/clinic/localization';

const profileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  email: z.string().email().max(254).optional().nullable(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional().nullable(),
  timezone: z.string().optional().nullable(),
  locale: z.enum(['ar', 'en']).optional().nullable(),
  date_format: z.string().max(30).optional().nullable(),
  number_format: z.enum(['en', 'ar']).optional().nullable(),
  fiscal_year: z.enum(['calendar', 'custom']).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  city: z.string().max(120).optional().nullable(),
  area: z.string().max(120).optional().nullable(),
  address_detail: z.string().max(500).optional().nullable(),
});

function buildProfileEnvelope(data: any, settings: any = null) {
  const legacyTimezone = (data?.settings && typeof data.settings === 'object' && 'timezone' in data.settings)
    ? String((data.settings as Record<string, unknown>).timezone ?? '')
    : null;

  return {
    ...data,
    currency: settings?.currency ?? null,
    timezone: settings?.timezone ?? legacyTimezone ?? null,
    locale: settings?.locale ?? null,
    date_format: settings?.date_format ?? null,
    number_format: settings?.number_format ?? null,
    fiscal_year: settings?.fiscal_year ?? null,
  };
}

type QueryResult<T> = { data: T | null; error: { message?: string } | null };

async function queryMaybeSingle<T>(query: any): Promise<QueryResult<T>> {
  if (typeof query?.maybeSingle === 'function') {
    return query.maybeSingle();
  }
  if (typeof query?.single === 'function') {
    return query.single();
  }
  return { data: null, error: { message: 'Query API is missing a terminal method' } };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const { data: clinic, error: clinicError } = await queryMaybeSingle(
      supabaseAdmin
        .from('clinics')
        .select('id, name, phone, address, address_detail, city, area, website, email, slug, settings, latitude, longitude, created_at, updated_at')
        .eq('id', clinicId)
        .is('deleted_at', null)
    );

    if (clinicError || !clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const { data: settings } = await queryMaybeSingle(
      supabaseAdmin
        .from('clinic_settings')
        .select('clinic_id, currency, timezone, locale, date_format, number_format, fiscal_year')
        .eq('clinic_id', clinicId)
    );

    return NextResponse.json({ data: buildProfileEnvelope(clinic, settings) });
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

    const denied = roleDenied(authorization, ADMIN_ROLES);
    if (denied) {
      return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    }

    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid profile payload', details: parsed.error.errors }, { status: 400 });
    }

    if (parsed.data.timezone !== undefined && parsed.data.timezone !== null && !validateIanaTimezone(parsed.data.timezone)) {
      return NextResponse.json({ error: 'INVALID_TIMEZONE' }, { status: 400 });
    }

    if (parsed.data.website !== undefined && parsed.data.website !== null && !/^https?:\/\//i.test(parsed.data.website)) {
      return NextResponse.json({ error: 'INVALID_WEBSITE' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      name: parsed.data.name ?? undefined,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      website: parsed.data.website ?? null,
      email: parsed.data.email ?? null,
    };
    const localizationPatch: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.latitude !== undefined) patch.latitude = parsed.data.latitude;
    if (parsed.data.longitude !== undefined) patch.longitude = parsed.data.longitude;
    if (parsed.data.city !== undefined) patch.city = parsed.data.city;
    if (parsed.data.area !== undefined) patch.area = parsed.data.area;
    if (parsed.data.address_detail !== undefined) patch.address_detail = parsed.data.address_detail;

    if (parsed.data.currency !== undefined) localizationPatch.currency = String(parsed.data.currency).toUpperCase();
    if (parsed.data.timezone !== undefined) localizationPatch.timezone = parsed.data.timezone ?? null;
    if (parsed.data.locale !== undefined) localizationPatch.locale = parsed.data.locale ?? null;
    if (parsed.data.date_format !== undefined) localizationPatch.date_format = parsed.data.date_format ?? null;
    if (parsed.data.number_format !== undefined) localizationPatch.number_format = parsed.data.number_format ?? null;
    if (parsed.data.fiscal_year !== undefined) localizationPatch.fiscal_year = parsed.data.fiscal_year ?? null;

    const { data: existingClinic, error: clinicError } = await queryMaybeSingle(
      supabaseAdmin
        .from('clinics')
        .update(Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)))
        .eq('id', clinicId)
        .is('deleted_at', null)
        .select('id, name, phone, address, address_detail, city, area, website, email, slug, settings, latitude, longitude, created_at, updated_at')
    );

    if (clinicError || !existingClinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    if (Object.keys(localizationPatch).length > 0) {
      const row = {
        clinic_id: clinicId,
        currency: localizationPatch.currency ?? 'ils',
        timezone: localizationPatch.timezone ?? 'UTC',
        locale: localizationPatch.locale ?? 'ar',
        date_format: localizationPatch.date_format ?? 'YYYY-MM-DD',
        number_format: localizationPatch.number_format ?? 'en',
        fiscal_year: localizationPatch.fiscal_year ?? 'calendar',
      };
      if (!validateIanaTimezone(row.timezone as string | null)) {
        return NextResponse.json({ error: 'INVALID_TIMEZONE' }, { status: 400 });
      }
      await supabaseAdmin.from('clinic_settings').upsert(row, { onConflict: 'clinic_id' });
    }

    const { data: settings } = await queryMaybeSingle(
      supabaseAdmin
        .from('clinic_settings')
        .select('clinic_id, currency, timezone, locale, date_format, number_format, fiscal_year')
        .eq('clinic_id', clinicId)
    );

    logEvent('clinic_profile_updated', { clinic_id: clinicId });
    return NextResponse.json({ data: buildProfileEnvelope(existingClinic, settings) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_profile_put_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}