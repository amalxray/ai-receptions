import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Returns only provider names/titles and clinic labels for the platform story editor dropdown. */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  try {
    const { data: providers, error } = await supabaseAdmin
      .from('providers')
      .select('id, clinic_id, name, title, provider_type')
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);

    const clinicIds = Array.from(new Set((providers ?? []).map((provider) => provider.clinic_id)));
    const { data: clinics, error: clinicError } = clinicIds.length
      ? await supabaseAdmin.from('clinics').select('id, name').in('id', clinicIds).is('deleted_at', null)
      : { data: [], error: null };
    if (clinicError) throw new Error(clinicError.message);

    const clinicNames = new Map((clinics ?? []).map((clinic) => [clinic.id, clinic.name]));
    return NextResponse.json({ data: (providers ?? []).map((provider) => ({
      id: provider.id,
      name: provider.name,
      specialty: provider.title ?? '',
      clinic: clinicNames.get(provider.clinic_id) ?? '',
      provider_type: provider.provider_type,
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر تحميل قائمة الأطباء' }, { status: 500 });
  }
}
