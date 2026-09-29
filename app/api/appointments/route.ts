import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { getCalendarRange } from '@/lib/services/scheduling';
import { getSupabaseEnvConfig } from '@/lib/config';
import { createDemoAppointment, getDemoAppointments, demoFallbackAllowed } from '@/lib/demoState';

/**
 * B51-D — fail-closed answer when the deployment has no Supabase env: in-memory
 * demo rows are development/test only, so production never answers with fakes.
 */
const NOT_CONFIGURED_RESPONSE = {
  error: 'قاعدة البيانات غير مُهيّأة على هذا النشر — تعذّر تنفيذ الطلب',
  code: 'NOT_CONFIGURED',
} as const;

/**
 * B23 — storage contract for wall-clock times.
 * `appointments` has NO time column: the time lives inside `scheduled_at`
 * (timestamptz). This mirrors lib/services/appointmentReschedule exactly, so a
 * CREATED and a RESCHEDULED appointment read back identically everywhere.
 */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const createAppointmentSchema = z.object({
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid().optional().nullable(),
  service: z.string().min(1),
  appointment_date: z.string().min(1),
  /**
   * B23 — HH:MM clinic-local. Before this existed the dashboard form collected a
   * time, the API silently dropped it, `scheduled_at` stayed NULL and every new
   * appointment was displayed as the hardcoded 09:00 fallback.
   */
  appointment_time: z.string().regex(TIME_PATTERN, 'appointment_time must be HH:MM').optional().nullable(),
  duration_minutes: z.coerce.number().int().min(15).max(480).default(30),
  provider_id: z.string().uuid().optional().nullable(),
  status: z.enum(['scheduled', 'confirmed', 'pending', 'cancelled']).optional().default('scheduled'),
});

const updateAppointmentSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'pending', 'cancelled', 'completed', 'no_show']).optional(),
  provider_id: z.string().uuid().optional().nullable(),
  appointment_date: z.string().min(1).optional(),
  scheduled_at: z.string().optional(),
});

/** "2026-09-29" + "14:30" → "2026-09-29T14:30:00.000Z" (reschedule convention). */
function buildScheduledAt(date?: string | null, time?: string | null): string | null {
  const day = (date ?? '').slice(0, 10);
  const clock = (time ?? '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !TIME_PATTERN.test(clock)) return null;
  return `${day}T${clock}:00.000Z`;
}

/**
 * B23 — resolves the display time of one row. `scheduled_at` is the source of
 * truth; a legacy text column is honoured when present; only a row with neither
 * keeps the historic 09:00 default. Never throws on a malformed timestamp.
 */
function readAppointmentTime(row: Record<string, unknown> | null | undefined): string {
  const scheduled = row?.scheduled_at;
  if (typeof scheduled === 'string' && scheduled.trim()) {
    const parsed = new Date(scheduled);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(11, 16);
  }
  const legacy = typeof row?.appointment_time === 'string' ? row.appointment_time.trim().slice(0, 5) : '';
  return TIME_PATTERN.test(legacy) ? legacy : '09:00';
}

async function getUserFromToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data?.user ?? null;
}

async function enrichAppointments(clinicId: string, rows: any[]) {
  if (!rows || rows.length === 0) return [];

  // Collect unique patient and provider IDs
  const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
  const providerIds = Array.from(new Set(rows.map((r) => r.provider_id).filter(Boolean)));

  // Load patient names
  let patientMap: Record<string, string> = {};
  if (patientIds.length > 0) {
    const { data: patients } = await supabaseAdmin
      .from('patients')
      .select('id, full_name')
      .in('id', patientIds);
    patientMap = Object.fromEntries((patients ?? []).map((p) => [p.id, p.full_name]));
  }

  // Load provider names
  let providerMap: Record<string, string> = {};
  if (providerIds.length > 0) {
    const { data: providers } = await supabaseAdmin
      .from('providers')
      .select('id, name')
      .in('id', providerIds);
    providerMap = Object.fromEntries((providers ?? []).map((p) => [p.id, p.name]));
  }

  return rows.map((row) => ({
    ...row,
    patient_name: patientMap[row.patient_id] ?? 'Unknown patient',
    provider_name: providerMap[row.provider_id] ?? null,
    appointment_time: readAppointmentTime(row),
  }));
}

export async function GET(req: Request) {
  try {
    const config = getSupabaseEnvConfig();
    if (!config.isConfigured) {
      // B51-D — demo data is development/test only.
      if (!demoFallbackAllowed()) {
        return NextResponse.json(NOT_CONFIGURED_RESPONSE, { status: 503 });
      }
      const appointments = getDemoAppointments().map((appointment) => ({
        ...appointment,
        patient_name: 'مريض تجريبي',
        appointment_time: readAppointmentTime(appointment),
      }));
      return NextResponse.json({ data: appointments });
    }

    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      logEvent('authorization_denied', { route: 'appointments_get', clinic_id: clinicId, reason: authorization.status === 401 ? 'unauthorized' : 'forbidden' }, 'warn');
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const view = url.searchParams.get('view') as 'day' | 'week' | 'month' | null;
    const date = url.searchParams.get('date');
    const status = url.searchParams.get('status');
    const providerId = url.searchParams.get('provider_id');
    /**
     * B48 — the patient file MUST be able to ask for one patient.
     *
     * Before this filter existed the file page fetched the whole clinic (capped at
     * 100 rows, ordered by `scheduled_at` ASC) and filtered in the browser, so on a
     * busy clinic a future appointment could fall outside the window and look
     * deleted. Rows are still enriched exactly the same way.
     */
    const patientId = url.searchParams.get('patient_id');
    // كل الفلاتر تُبنى قبل `.order().limit()` — النتيجة واحدة في PostgREST، لكن
    // القراءة أوضح: الفلترة ثم الترتيب ثم السقف.
    let query = supabaseAdmin.from('appointments').select('*').eq('clinic_id', clinicId);
    if (view && date) {
      const range = getCalendarRange(date, view);
      query = query.gte('scheduled_at', range.start).lt('scheduled_at', range.end);
    }
    if (status) query = query.eq('status', status);
    if (providerId) query = query.eq('provider_id', providerId);
    if (patientId) query = query.eq('patient_id', patientId);
    const { data, error } = await query
      .order('scheduled_at', { ascending: true })
      .limit(100);
    if (error) {
      logEvent('appointment_query_failure', { clinic_id: clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = await enrichAppointments(clinicId, data ?? []);
    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    logEvent('appointments_route_error', { error: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'error');
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      logEvent('appointment_validation_error', { error: parsed.error.errors }, 'warn');
      return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
    }

    const config = getSupabaseEnvConfig();
    if (!config.isConfigured) {
      // B51-D — no silent demo writes in production.
      if (!demoFallbackAllowed()) {
        return NextResponse.json(NOT_CONFIGURED_RESPONSE, { status: 503 });
      }
      const created = createDemoAppointment({
        clinic_id: parsed.data.clinic_id,
        patient_id: parsed.data.patient_id ?? null,
        service: parsed.data.service,
        appointment_date: parsed.data.appointment_date,
        appointment_time: parsed.data.appointment_time ?? '09:00',
        duration_minutes: parsed.data.duration_minutes,
        provider_id: parsed.data.provider_id ?? null,
        status: parsed.data.status,
      });
      return NextResponse.json({ data: { ...created, patient_name: 'مريض تجريبي', appointment_time: created.appointment_time ?? '09:00' } }, { status: 201 });
    }

    const { clinic_id, patient_id, service, appointment_date, duration_minutes, provider_id, status, appointment_time } = parsed.data;
    const authorization = await authorizeClinicRequest(req, clinic_id);
    if (!authorization.authorized) {
      logEvent('authorization_denied', { route: 'appointments_post', clinic_id, reason: authorization.status === 401 ? 'unauthorized' : 'forbidden' }, 'warn');
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    // B23 — the chosen time must actually be persisted: `scheduled_at` is what the
    // agenda, the reminders and the patient profile all read. A caller that sends
    // no time keeps the old NULL behaviour (no scheduled_at key at all).
    const scheduledAt = buildScheduledAt(appointment_date, appointment_time);
    const insertPayload: Record<string, unknown> = {
      clinic_id,
      patient_id,
      service,
      appointment_date,
      duration_minutes,
      provider_id,
      status,
    };
    if (scheduledAt) insertPayload.scheduled_at = scheduledAt;

    const { data, error } = await supabaseAdmin.from('appointments').insert([
      insertPayload,
    ]).select('*').single();
    if (error) {
      // The partial unique index on (provider_id, scheduled_at) rejects a slot
      // that is already taken — that is a conflict, not a server fault.
      if (error.code === '23505' || /duplicate key/i.test(error.message)) {
        logEvent('appointment_slot_conflict', { clinic_id, provider_id: provider_id || undefined, scheduled_at: scheduledAt ?? undefined }, 'warn');
        return NextResponse.json({ error: 'هذا الموعد محجوز بالفعل — اختر وقتاً آخر' }, { status: 409 });
      }
      logEvent('appointment_create_failure', { clinic_id, patient_id: patient_id || undefined, provider_id: provider_id || undefined, error: error.message }, 'error');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = await enrichAppointments(clinic_id, [data]);
    return NextResponse.json({ data: enriched[0] }, { status: 201 });
  } catch (err: any) {
    logEvent('appointments_route_error', { error: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'error');
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    const appointmentId = url.searchParams.get('appointment_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    if (!appointmentId) return NextResponse.json({ error: 'appointment_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: authorization.status });
    }

    const body = await req.json();
    const parsed = updateAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid appointment update', details: parsed.error.errors }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .update(parsed.data)
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const enriched = await enrichAppointments(clinicId, [data]);
    logEvent('appointment_updated', { clinic_id: clinicId, appointment_id: appointmentId });
    return NextResponse.json({ data: enriched[0] });
  } catch (err: any) {
    logEvent('appointments_patch_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}