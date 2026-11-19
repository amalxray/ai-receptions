import { NextResponse } from 'next/server';
import { z } from 'zod';
import { permissionDenied } from '@/lib/services/permissionGate';
import { DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { readPublicProfile } from '@/lib/services/clinicPublicConfig';
import { normalizeActivityType } from '@/lib/services/activityTypes';
import { buildClinicSchema } from '@/lib/services/doctorJsonLd';
import { getClinicReviewsStatsWithAvailability } from '@/lib/services/reviewsService';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

const querySchema = z.object({ clinic_id: z.string().uuid() });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ clinic_id: url.searchParams.get('clinic_id') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const clinicId = parsed.data.clinic_id;
    const permission = await permissionDenied(req, clinicId, 'view_public_page', { allowedRoles: DATA_ROLES });
    if (permission) return permission;

    const { data: clinic, error } = await supabaseAdmin
      .from('clinics')
      .select('id, slug, name, activity_type, settings')
      .eq('id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const activityType = normalizeActivityType(clinic.activity_type ?? 'clinic');
    const publicProfile = readPublicProfile(clinic.settings, activityType);
    const faqCount = (publicProfile.faq ?? []).filter(
      (item) =>
        typeof item?.question === 'string' &&
        item.question.trim().length > 0 &&
        typeof item.answer === 'string' &&
        item.answer.trim().length > 0
    ).length;
    const schemaType =
      activityType === 'dental_lab'
        ? 'MedicalBusiness'
        : buildClinicSchema({ name: clinic.name, slug: clinic.slug })['@type'];
    const reviewStats = await getClinicReviewsStatsWithAvailability(clinicId);

    return NextResponse.json({
      data: {
        slug: clinic.slug,
        publicPageAvailable: Boolean(clinic.slug),
        schemaType,
        faqCount,
        reviews: reviewStats
          ? { total: reviewStats.total, average: reviewStats.average }
          : null,
      },
    });
  } catch (err) {
    logEvent('clinic_geo_status_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل حالة الحضور الرقمي.' }, { status: 500 });
  }
}
