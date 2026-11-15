import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, DATA_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';

export async function authorizeReverseReferral(
  req: Request,
  fromClinicId: string,
  toClinicId: string,
) {
  const auth = await authorizeClinicRequest(req, fromClinicId);
  if (!auth.authorized) return { ok: false as const, status: auth.status };
  if (roleDenied(auth, DATA_ROLES)) return { ok: false as const, status: 403 };

  const [sourceResult, targetResult, relationResult] = await Promise.all([
    supabaseAdmin
      .from('clinics')
      .select('id, activity_type')
      .eq('id', fromClinicId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabaseAdmin
      .from('clinics')
      .select('id, activity_type')
      .eq('id', toClinicId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabaseAdmin
      .from('organization_relationships')
      .select('id')
      .or(
        `and(source_org_id.eq.${fromClinicId},target_org_id.eq.${toClinicId}),and(source_org_id.eq.${toClinicId},target_org_id.eq.${fromClinicId})`,
      )
      .eq('status', 'accepted')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (sourceResult.error) throw new Error(sourceResult.error.message);
  if (targetResult.error) throw new Error(targetResult.error.message);
  if (relationResult.error) throw new Error(relationResult.error.message);

  if (sourceResult.data?.activity_type !== 'imaging_center') {
    return { ok: false as const, status: 403 };
  }
  if (targetResult.data?.activity_type !== 'clinic' || !relationResult.data) {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const, auth };
}
