import { NextResponse } from 'next/server';
import { permissionDenied } from '@/lib/services/permissionGate';
import { getPatientBalances } from '@/lib/services/accounting';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permBlocked = await permissionDenied(req, clinicId, [
      'view_financial',
      'manage_invoices',
      'manage_payments',
    ]);
    if (permBlocked) return permBlocked;
    const data = await getPatientBalances(clinicId, url.searchParams.get('patient_id'));
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
