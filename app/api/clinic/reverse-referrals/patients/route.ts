import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeSearchQuery } from '@/lib/services/patientSearch';
import { authorizeReverseReferral } from '@/lib/services/reverseReferrals';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fromClinicId = url.searchParams.get('clinic_id') ?? '';
    const toClinicId = url.searchParams.get('target_clinic_id') ?? '';
    const query = sanitizeSearchQuery(url.searchParams.get('q') ?? '').trim();
    if (!uuidPattern.test(fromClinicId) || !uuidPattern.test(toClinicId) || query.length < 2 || query.length > 100) {
      return NextResponse.json({ error: 'بيانات البحث غير صحيحة' }, { status: 400 });
    }

    const access = await authorizeReverseReferral(req, fromClinicId, toClinicId);
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

    const pattern = `%${query}%`;
    const { data, error } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id, full_name, phone_number')
      .eq('clinic_id', toClinicId)
      .is('deleted_at', null)
      .or(`full_name.ilike.${pattern},phone_number.ilike.${pattern}`)
      .order('full_name', { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      data: (data ?? []).map((patient) => ({
        id: patient.id,
        name: patient.full_name,
        phone: patient.phone_number,
      })),
    });
  } catch (error) {
    logEvent('reverse_referral_patient_search_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر البحث عن المرضى' }, { status: 500 });
  }
}

const createPatientSchema = z.object({
  clinic_id: z.string().uuid(),
  source_patient_id: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(40).optional().default(''),
});

export async function POST(req: Request) {
  try {
    const fromClinicId = new URL(req.url).searchParams.get('clinic_id') ?? '';
    const body = await req.json().catch(() => null);
    const parsed = createPatientSchema.safeParse(body);
    if (!uuidPattern.test(fromClinicId) || !parsed.success) {
      return NextResponse.json({ error: 'بيانات المريض غير صحيحة' }, { status: 400 });
    }

    const { clinic_id: toClinicId, source_patient_id: sourcePatientId, name, phone } = parsed.data;
    const access = await authorizeReverseReferral(req, fromClinicId, toClinicId);
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

    const { data: sourcePatient, error: sourcePatientError } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('id', sourcePatientId)
      .eq('clinic_id', fromClinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (sourcePatientError) throw new Error(sourcePatientError.message);
    if (!sourcePatient) return NextResponse.json({ error: 'ملف مريض مركز التصوير غير موجود' }, { status: 404 });

    if (phone) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('patients')
        .select('id, full_name, phone_number')
        .eq('clinic_id', toClinicId)
        .eq('phone_number', phone)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing) {
        return NextResponse.json({ error: 'يوجد مريض بهذا الرقم في العيادة المستهدفة', patient: existing }, { status: 409 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('patients')
      .insert({
        clinic_id: toClinicId,
        full_name: name,
        phone_number: phone || null,
        metadata: { source: 'تحويل من مركز تصوير', status: 'جديد' },
      })
      .select('id, clinic_id, full_name, phone_number')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      data: { id: data.id, name: data.full_name, phone: data.phone_number },
    }, { status: 201 });
  } catch (error) {
    logEvent('reverse_referral_patient_create_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر إنشاء ملف المريض' }, { status: 500 });
  }
}
