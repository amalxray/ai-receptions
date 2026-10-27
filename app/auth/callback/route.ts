import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { provisionPatientIdentity } from '@/lib/services/patientPortal';
import { logEvent } from '@/lib/server/logging';
import { clinicSpaceUrl } from '@/lib/vercel/domains';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePalestinianPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const latin = value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
  const compact = latin.trim().replace(/[\s().-]/g, '');
  if (!/^(?:05|\+970|00970)/.test(compact)) return null;

  const digits = compact.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (compact.startsWith('00970')) return `0${digits.slice(5)}`;
  if (compact.startsWith('+970')) return `0${digits.slice(3)}`;
  return digits;
}

/** Find a unique clinic patient matching the phone on this clinic's booking. */
async function findUniqueBookingPhonePatient(clinicId: string, appointmentId: string): Promise<string | null> {
  const { data: appointment, error: appointmentError } = await supabaseAdmin
    .from('appointments')
    .select('patient_id')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (appointmentError) throw new Error(appointmentError.message);
  if (typeof appointment?.patient_id !== 'string') return null;

  const { data: bookingPatient, error: bookingPatientError } = await supabaseAdmin
    .from('patients')
    .select('phone_number')
    .eq('id', appointment.patient_id)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (bookingPatientError) throw new Error(bookingPatientError.message);
  const bookingPhone = normalizePalestinianPhone(bookingPatient?.phone_number);
  if (!bookingPhone) return null;

  const matches: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data: patients, error: patientsError } = await supabaseAdmin
      .from('patients')
      .select('id, phone_number')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .not('phone_number', 'is', null)
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (patientsError) throw new Error(patientsError.message);

    for (const patient of patients ?? []) {
      if (normalizePalestinianPhone(patient.phone_number) === bookingPhone) {
        matches.push(patient.id);
        if (matches.length > 1) break;
      }
    }
    if (matches.length > 1 || (patients ?? []).length < pageSize) break;
  }

  return matches.length === 1 ? matches[0] : null;
}

/** Exchange the OAuth code, then link one exact clinic-scoped email or phone match. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const clinicIdParam = searchParams.get('clinic_id');
      const clinicSlugParam = searchParams.get('clinic_slug');
      const appointmentIdParam = searchParams.get('appointment_id');
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
        if (clinic) {
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

          let patientIdToLink: string | null = matches.length === 1 ? matches[0].id : null;
          // A phone fallback is used only when the clinic has no email match.
          // Multiple email matches remain ambiguous and must not be guessed.
          if (
            matches.length === 0 &&
            appointmentIdParam &&
            UUID_PATTERN.test(appointmentIdParam)
          ) {
            patientIdToLink = await findUniqueBookingPhonePatient(clinic.id, appointmentIdParam);
          }

          if (patientIdToLink) {
            await provisionPatientIdentity({
              clinicId: clinic.id,
              patientId: patientIdToLink,
              email: normalizedGoogleEmail,
              userId: user.id,
            });
            const { data: identity, error: identityError } = await supabaseAdmin
              .from('clinic_patient_identities')
              .select('id')
              .eq('clinic_id', clinic.id)
              .eq('patient_id', patientIdToLink)
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
