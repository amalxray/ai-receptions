import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** GET /api/public/stats — live platform counters for the /ask stats section. */
export async function GET() {
  try {
    const [clinics, patients, cities] = await Promise.all([
      supabaseAdmin.from('clinics').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabaseAdmin.from('patients').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabaseAdmin.from('platform_cities').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    return NextResponse.json({
      clinics_count: clinics.count ?? 0,
      patients_count: patients.count ?? 0,
      cities_count: cities.count ?? 0,
    });
  } catch {
    return NextResponse.json({ clinics_count: 0, patients_count: 0, cities_count: 0 });
  }
}
