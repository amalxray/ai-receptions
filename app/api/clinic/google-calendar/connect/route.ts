export const preferredRegion = 'icn1';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import {
  createGoogleCalendarAuthorizationUrl,
  getMissingGoogleCalendarOAuthSettings,
  isGoogleCalendarOAuthConfigured,
} from '@/lib/services/googleCalendarOAuth';

async function clinicSlugFromReferer(req: Request): Promise<string | null> {
  const referer = req.headers.get('referer');
  if (!referer) return null;

  try {
    const refererUrl = new URL(referer);
    const requestUrl = new URL(req.url);
    if (refererUrl.origin !== requestUrl.origin) return null;
    const match = refererUrl.pathname.match(/^\/dashboard\/([^/]+)\/communication-settings\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!isGoogleCalendarOAuthConfigured()) {
    return NextResponse.json({
      error: 'إعدادات Google OAuth غير مكتملة على الخادم.',
      missing_settings: getMissingGoogleCalendarOAuthSettings(),
    }, { status: 503 });
  }

  const serverClient = createSupabaseServerClient();
  const { data: { user }, error: authError } = await serverClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'سجّل الدخول قبل ربط تقويم العيادة.' }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('clinic_users')
    .select('clinic_id, role, clinics!inner(slug)')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  if (membershipError) {
    return NextResponse.json({ error: 'تعذر التحقق من عضوية العيادة.' }, { status: 500 });
  }

  const adminMemberships = (memberships ?? []).filter((membership) =>
    ADMIN_ROLES.includes(membership.role)
  );
  const requestedSlug = await clinicSlugFromReferer(req);
  const selectedMembership = requestedSlug
    ? adminMemberships.find((membership) => {
        const clinic = Array.isArray(membership.clinics) ? membership.clinics[0] : membership.clinics;
        return clinic?.slug === requestedSlug;
      })
    : adminMemberships.length === 1
      ? adminMemberships[0]
      : null;

  if (!selectedMembership) {
    return NextResponse.json({
      error: adminMemberships.length > 1
        ? 'افتح إعدادات التواصل الخاصة بالعيادة المطلوبة ثم أعد محاولة الربط.'
        : 'لا توجد عيادة تملك صلاحية ربط تقويمها.',
    }, { status: adminMemberships.length > 1 ? 409 : 403 });
  }

  const authorizationUrl = createGoogleCalendarAuthorizationUrl(selectedMembership.clinic_id, user.id);
  return NextResponse.redirect(authorizationUrl);
}
