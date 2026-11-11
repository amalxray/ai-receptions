import { NextResponse } from 'next/server';
import { getSupabaseEnvConfig } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { DATA_ROLES, authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { toPatientShape } from '@/lib/services/patientShape';
import { sanitizeSearchQuery } from '@/lib/services/patientSearch';
import { createDemoPatient, getDemoPatients, demoFallbackAllowed } from '@/lib/demoState';

/**
 * B51-D — the fail-closed answer for a deployment that has NO Supabase env.
 * In-memory demo rows may only ever be served outside production
 * (`demoFallbackAllowed()`), so a misconfigured production deployment can never
 * look "alive" while serving fake patients.
 */
const NOT_CONFIGURED_RESPONSE = {
  error: 'قاعدة البيانات غير مُهيّأة على هذا النشر — تعذّر تنفيذ الطلب',
  code: 'NOT_CONFIGURED',
} as const;

/** Default list size; patient searches may request up to the API row cap. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchQuery = sanitizeSearchQuery(url.searchParams.get('q') ?? '');
  const dateFilter = searchQuery ? 'all' : url.searchParams.get('date_filter') ?? 'all';
  const timezoneOffsetParam = url.searchParams.get('timezone_offset');
  const timezoneOffset = timezoneOffsetParam === null ? 0 : Number(timezoneOffsetParam);

  if (!['today', 'week', 'all'].includes(dateFilter)) {
    return NextResponse.json({ error: 'date_filter must be today, week, or all' }, { status: 400 });
  }
  if (
    dateFilter === 'today' &&
    (!Number.isInteger(timezoneOffset) || Math.abs(timezoneOffset) > 14 * 60)
  ) {
    return NextResponse.json({ error: 'timezone_offset must be a whole number between -840 and 840' }, { status: 400 });
  }

  const now = new Date();
  let createdAtFrom: Date | null = null;
  let createdAtUntil: Date | null = null;
  if (dateFilter === 'today') {
    const localNow = new Date(now.getTime() - timezoneOffset * 60_000);
    const localMidnightAsUtc = Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate()
    );
    createdAtFrom = new Date(localMidnightAsUtc + timezoneOffset * 60_000);
    createdAtUntil = new Date(createdAtFrom.getTime() + 24 * 60 * 60_000);
  } else if (dateFilter === 'week') {
    createdAtFrom = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    createdAtUntil = now;
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    // B51-D — demo data is development/test only (see demoFallbackAllowed).
    if (demoFallbackAllowed()) {
      const demoPatients = getDemoPatients();
      const filteredPatients = createdAtFrom && createdAtUntil
        ? demoPatients.filter((patient) => {
            const createdAt = Date.parse(patient.created_at);
            return createdAt >= createdAtFrom.getTime() && createdAt < createdAtUntil.getTime();
          })
        : demoPatients;
      return NextResponse.json(filteredPatients);
    }
    return NextResponse.json(NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  try {
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }
    const permission = await permissionDenied(req, clinicId, 'view_patients', { allowedRoles: [...DATA_ROLES, 'accountant'] });
    if (permission) return permission;

    // N28 — the raw query used to be interpolated into PostgREST's `.or()` as-is,
    // so a comma / parenthesis / `*` produced `failed to parse logic tree` (500).
    // Sanitising here keeps the filter syntax intact AND searches the same folded
    // shape the browser matches on (hamza forms, ة/ه, Arabic-Indic digits).
    const requestedLimit = Number(url.searchParams.get('limit'));
    const defaultLimit = searchQuery ? MAX_LIMIT : DEFAULT_LIMIT;
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
        : defaultLimit;

    const supabase = supabaseAdmin;
    let query = supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (createdAtFrom && createdAtUntil) {
      query = query
        .gte('created_at', createdAtFrom.toISOString())
        .lt('created_at', createdAtUntil.toISOString());
    }

    if (searchQuery) {
      // N28 — `notes` joins the three original columns: "الملاحظة" is one of the
      // four fields the receptionist is told to search by.
      const pattern = `%${searchQuery}%`;
      query = query.or(
        [
          `full_name.ilike.${pattern}`,
          `phone_number.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `notes.ilike.${pattern}`,
        ].join(',')
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json((data || []).map(toPatientShape));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load patients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const config = getSupabaseEnvConfig();
  const body = await request.json();
  const metadata = {
    source: body.source ?? 'موقع الويب',
    status: body.status ?? 'جديد',
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    ...(body.date_of_birth ? { date_of_birth: body.date_of_birth } : {}),
  };
  const payload = {
    id: crypto.randomUUID(),
    clinic_id: body.clinic_id ?? '00000000-0000-0000-0000-000000000000',
    name: body.name ?? body.full_name ?? 'مريض جديد',
    // '' would collide with other email-less patients under the unique index
    // (clinic_id, lower(email)); store NULL for "no email" instead.
    email: (body.email ?? '').trim() || null,
    phone: (body.phone ?? body.phone_number ?? '').trim() || null,
    source: metadata.source,
    status: metadata.status,
    notes: body.notes ?? null,
    metadata,
  };

  if (!config.isConfigured) {
    // B51-D — no silent demo writes in production.
    if (!demoFallbackAllowed()) {
      return NextResponse.json(NOT_CONFIGURED_RESPONSE, { status: 503 });
    }
    const demoPayload = createDemoPatient(payload);
    return NextResponse.json(demoPayload, { status: 201 });
  }

  try {
    const authorization = await authorizeClinicRequest(request, payload.clinic_id);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }
    const permission = await permissionDenied(request, payload.clinic_id, 'manage_patients', { allowedRoles: [...DATA_ROLES, 'accountant'] });
    if (permission) return permission;

    const supabase = supabaseAdmin;
    const { data, error } = await supabase
      .from('patients')
      .insert({
        id: payload.id,
        clinic_id: payload.clinic_id,
        full_name: payload.name,
        email: payload.email,
        phone_number: payload.phone,
        notes: payload.notes,
        metadata: payload.metadata,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(toPatientShape(data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create patient' }, { status: 500 });
  }
}
