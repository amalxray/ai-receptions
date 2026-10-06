import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseEnvConfig } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

/**
 * Aggregated dashboard overview — count-accurate and clinic-isolated.
 * Every count is derived from server-side Supabase count queries instead of local row length checks.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const config = getSupabaseEnvConfig();
    if (!config.supabaseUrl || !config.anonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }

    const cookieStore = cookies();
    const serverClient = createServerClient(config.supabaseUrl, config.anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    });

    const { data: { session }, error: sessionError } = await serverClient.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'يرجى تسجيل الدخول.' }, { status: 401 });
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from('clinic_users')
      .select('role')
      .eq('clinic_id', clinicId)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: 'لا تملك صلاحية عرض بيانات هذه العيادة.' }, { status: 403 });
    }

    const supabase = supabaseAdmin;

    const [patientsCountRes, appointmentsRes, conversationsRes, revenueCountRes] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId).is('deleted_at', null),
      supabase
        .from('appointments')
        .select('id, appointment_date, scheduled_at, status, patient_id, service_id, provider_id', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('appointment_date', { ascending: true }),
      supabase
        .from('conversations')
        .select('id, status, started_at, metadata', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .gte('started_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('revenue').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId),
    ]);

    if (patientsCountRes.error || appointmentsRes.error || conversationsRes.error || revenueCountRes.error) {
      throw new Error(
        patientsCountRes.error?.message ||
          appointmentsRes.error?.message ||
          conversationsRes.error?.message ||
          revenueCountRes.error?.message ||
          'overview query failed'
      );
    }

    type ApptRow = {
      id: string;
      appointment_date: string | null;
      scheduled_at: string | null;
      status: string | null;
      patient_id: string | null;
      service_id: string | null;
      provider_id: string | null;
    };
    const appointments = (appointmentsRes.data ?? []) as ApptRow[];

    // Today in the clinic timezone (fallback Asia/Jerusalem).
    let todayIso: string;
    try {
      todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    } catch {
      todayIso = new Date().toISOString().slice(0, 10);
    }

    const isCancelled = (s: string | null) => s === 'cancelled';
    const activeAppointments = appointments.filter((a) => !isCancelled(a.status));
    const todays = activeAppointments.filter((a) => a.appointment_date === todayIso);
    const upcoming = activeAppointments
      .filter((a) => a.appointment_date && a.appointment_date > todayIso)
      .slice(0, 5);

    const patientIds = Array.from(new Set(appointments.map((a) => a.patient_id).filter(Boolean))) as string[];
    const patientsMap = new Map<string, string>();
    if (patientIds.length > 0) {
      const { data: pRows } = await supabase.from('patients').select('id, full_name').in('id', patientIds).eq('clinic_id', clinicId);
      for (const p of pRows ?? []) patientsMap.set(p.id, (p as { full_name?: string }).full_name ?? '');
    }
    const decorate = (list: ApptRow[]) =>
      list.map((a) => ({
        id: a.id,
        date: a.appointment_date,
        time: a.scheduled_at ? a.scheduled_at.slice(11, 16) : null,
        status: a.status,
        patient_name: (a.patient_id && patientsMap.get(a.patient_id)) || null,
      }));

    const conversations = conversationsRes.data ?? [];
    const needsAttention = conversations.filter((c) => c.status === 'awaiting_human');

    logEvent('clinic_overview_loaded', { clinic_id: clinicId });
    return NextResponse.json({
      data: {
        patients_count: patientsCountRes.count ?? 0,
        today_appointments: decorate(todays),
        upcoming_appointments: decorate(upcoming),
        appointments_count: appointmentsRes.count ?? appointments.length,
        new_conversations_count: conversationsRes.count ?? conversations.length,
        needs_attention_count: needsAttention.length,
        revenue_count: revenueCountRes.count ?? 0,
        generated_for_day: todayIso,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_overview_error', { error: message }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل بيانات لوحة التحكم. حاول مرة أخرى.' }, { status: 500 });
  }
}
