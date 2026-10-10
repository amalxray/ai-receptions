import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import {
  finishGoogleCalendarAuthorization,
  verifyGoogleCalendarOAuthState,
} from '@/lib/services/googleCalendarOAuth';
import { logEvent } from '@/lib/server/logging';

function settingsUrl(slug: string, status: 'connected' | 'failed' | 'cancelled'): URL {
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (!redirectUri) throw new Error('Google Calendar OAuth redirect URI is not configured.');
  const url = new URL(`/dashboard/${encodeURIComponent(slug)}/communication-settings`, new URL(redirectUri).origin);
  url.searchParams.set('google_calendar', status);
  return url;
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const stateValue = requestUrl.searchParams.get('state');
  const state = stateValue ? verifyGoogleCalendarOAuthState(stateValue) : null;
  if (!state) {
    return NextResponse.json({
      error: 'انتهت صلاحية رابط ربط Google أو لم يعد صالحاً. ارجع إلى إعدادات التواصل واضغط «ربط Google Calendar» مجدداً.',
    }, { status: 400 });
  }

  try {
    const serverClient = createSupabaseServerClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user || user.id !== state.user_id) {
      return NextResponse.json({ error: 'انتهت جلسة الدخول. سجّل الدخول ثم أعد ربط التقويم.' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('clinic_users')
      .select('role')
      .eq('clinic_id', state.clinic_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !ADMIN_ROLES.includes(membership.role)) {
      return NextResponse.json({ error: 'لا تملك صلاحية ربط تقويم هذه العيادة.' }, { status: 403 });
    }

    const providerError = requestUrl.searchParams.get('error');
    if (providerError) {
      const { data: clinic, error } = await supabaseAdmin
        .from('clinics')
        .select('slug')
        .eq('id', state.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!clinic?.slug) return NextResponse.json({ error: 'العيادة غير موجودة.' }, { status: 404 });
      return NextResponse.redirect(settingsUrl(clinic.slug, 'cancelled'));
    }

    const code = requestUrl.searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'لم يُرجع Google رمز التفويض.' }, { status: 400 });
    await finishGoogleCalendarAuthorization(state.clinic_id, code);

    const { data: clinic, error } = await supabaseAdmin
      .from('clinics')
      .select('slug')
      .eq('id', state.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!clinic?.slug) return NextResponse.json({ error: 'العيادة غير موجودة.' }, { status: 404 });
    return NextResponse.redirect(settingsUrl(clinic.slug, 'connected'));
  } catch (error) {
    logEvent('clinic_google_calendar_oauth_callback_failed', {
      clinic_id: state.clinic_id,
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('slug')
      .eq('id', state.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (clinic?.slug) return NextResponse.redirect(settingsUrl(clinic.slug, 'failed'));
    return NextResponse.json({ error: 'تعذر إكمال ربط تقويم Google.' }, { status: 500 });
  }
}
