import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { provisionPatientIdentity } from '@/lib/services/patientPortal';
import { logEvent } from '@/lib/server/logging';
import { clinicSpaceUrl } from '@/lib/vercel/domains';
import { isSubdomainReady } from '@/lib/vercel/subdomainReadiness';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Exchange the OAuth code, then optionally link one exact clinic-scoped email match. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const clinicIdParam = searchParams.get('clinic_id');
      const clinicSlugParam = searchParams.get('clinic_slug');
      const hasClinicContext = Boolean(clinicIdParam || clinicSlugParam);
      if (!hasClinicContext) return NextResponse.redirect(new URL('/', origin));

      let linked = false;
      let clinicReturnOrigin: string | null = null;
      try {
        const clinic = clinicIdParam && UUID_PATTERN.test(clinicIdParam)
          ? await resolvePublicClinic({ id: clinicIdParam })
          : !clinicIdParam && clinicSlugParam
            ? await resolvePublicClinic({ slug: clinicSlugParam })
            : null;
        if (
          clinic &&
          process.env.VERCEL_ENV === 'production' &&
          await isSubdomainReady(clinic.slug)
        ) {
          clinicReturnOrigin = new URL(clinicSpaceUrl(clinic.slug)).origin;
        }
        const { data: authData, error: userError } = await supabase.auth.getUser();
        const user = authData?.user;
        const normalizedGoogleEmail = user?.email?.trim().toLowerCase();

        if (clinic && user && !userError && user.email_confirmed_at && normalizedGoogleEmail) {
          const matches: Array<{ id: string }> = [];
          const pageSize = 500;
          for (let offset = 0; ; offset += pageSize) {
            const { data: patients, error: patientsError } = await supabaseAdmin
              .from('patients')
              .select('id, email')
              .eq('clinic_id', clinic.id)
              .is('deleted_at', null)
              .not('email', 'is', null)
              .order('id')
              .range(offset, offset + pageSize - 1);
            if (patientsError) throw new Error(patientsError.message);

            for (const patient of patients ?? []) {
              if (typeof patient.email === 'string' && patient.email.trim().toLowerCase() === normalizedGoogleEmail) {
                matches.push({ id: patient.id });
                if (matches.length > 1) break;
              }
            }
            if (matches.length > 1 || (patients ?? []).length < pageSize) break;
          }

          if (matches.length === 1) {
            await provisionPatientIdentity({
              clinicId: clinic.id,
              patientId: matches[0].id,
              email: normalizedGoogleEmail,
              userId: user.id,
            });
            const { data: identity, error: identityError } = await supabaseAdmin
              .from('clinic_patient_identities')
              .select('id')
              .eq('clinic_id', clinic.id)
              .eq('patient_id', matches[0].id)
              .eq('user_id', user.id)
              .eq('status', 'active')
              .is('deleted_at', null)
              .not('verified_at', 'is', null)
              .maybeSingle();
            if (identityError) throw new Error(identityError.message);
            linked = Boolean(identity);
          }
        }
      } catch (linkError) {
        logEvent('oauth_patient_auto_link_failed', {
          error: linkError instanceof Error ? linkError.message : String(linkError),
        }, 'warn');
      }

      // In production, return to this clinic's canonical tenant origin. The
      // callback itself can be reached through www when the auth redirect
      // allowlist falls back to the platform host; a clinic-scoped URL keeps
      // the patient's journey on the clinic domain without a fixed SITE_URL.
      const destination = new URL('/portal', clinicReturnOrigin ?? origin);
      destination.searchParams.set('link', linked ? 'linked' : 'unlinked');
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.redirect(new URL('/?auth=callback_failed', origin));
}
