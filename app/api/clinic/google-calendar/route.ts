import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createGoogleCalendarAuthorizationUrl,
  disconnectGoogleCalendar,
  getMissingGoogleCalendarOAuthSettings,
  getGoogleCalendarConnectionStatus,
  isGoogleCalendarOAuthConfigured,
} from '@/lib/services/googleCalendarOAuth';
import { ADMIN_ROLES, authorizeClinicRequest, roleDenied } from '@/lib/services/clinicAuthorization';
import { logEvent } from '@/lib/server/logging';

const clinicIdSchema = z.string().uuid();

async function authorize(req: Request) {
  const clinicId = new URL(req.url).searchParams.get('clinic_id');
  if (!clinicIdSchema.safeParse(clinicId).success) {
    return { clinicId: null, denial: NextResponse.json({ error: 'clinic_id is required' }, { status: 400 }) };
  }
  const authorization = await authorizeClinicRequest(req, clinicId);
  const denied = roleDenied(authorization, ADMIN_ROLES);
  if (denied) {
    return {
      clinicId: null,
      denial: NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status }),
    };
  }
  return { clinicId, authorization, denial: null };
}

export async function GET(req: Request) {
  try {
    const access = await authorize(req);
    if (access.denial || !access.clinicId) return access.denial;
    return NextResponse.json({
      configured: isGoogleCalendarOAuthConfigured(),
      missing_settings: getMissingGoogleCalendarOAuthSettings(),
      ...(await getGoogleCalendarConnectionStatus(access.clinicId)),
    });
  } catch (error) {
    logEvent('clinic_google_calendar_status_failed', {
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل حالة ربط التقويم.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await authorize(req);
    if (access.denial || !access.clinicId) return access.denial;
    if (!isGoogleCalendarOAuthConfigured()) {
      return NextResponse.json({
        error: 'إعدادات Google OAuth غير مكتملة على الخادم.',
        missing_settings: getMissingGoogleCalendarOAuthSettings(),
      }, { status: 503 });
    }
    const authorizationUrl = createGoogleCalendarAuthorizationUrl(access.clinicId, access.authorization.user.id);
    return NextResponse.json({ authorization_url: authorizationUrl });
  } catch (error) {
    logEvent('clinic_google_calendar_connect_start_failed', {
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    return NextResponse.json({ error: 'تعذر بدء ربط تقويم Google.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const access = await authorize(req);
    if (access.denial || !access.clinicId) return access.denial;
    await disconnectGoogleCalendar(access.clinicId);
    return NextResponse.json({ connected: false });
  } catch (error) {
    logEvent('clinic_google_calendar_disconnect_failed', {
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    return NextResponse.json({ error: 'تعذر فصل تقويم Google.' }, { status: 500 });
  }
}
