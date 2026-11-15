import { NextResponse } from 'next/server';
import { permissionDenied } from '@/lib/services/permissionGate';
import { getAgingSummary } from '@/lib/services/accounting';

// Accounting Phase B — receivable aging (D-B5). Derived, read-only.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, ['view_financial', 'manage_invoices']);
    if (permission) return permission;
    const data = await getAgingSummary(clinicId, url.searchParams.get('patient_id'));
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
