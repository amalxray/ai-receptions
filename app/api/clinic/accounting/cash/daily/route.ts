import { NextResponse } from 'next/server';
import { permissionDenied } from '@/lib/services/permissionGate';
import { getDailyCashPositions } from '@/lib/services/accounting';

// Accounting Phase C — derived daily cash positions (read-only, never stored).
// Source: explicit ledger kinds filtered by method='cash' (never direction).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, 'view_financial');
    if (permission) return permission;
    const data = await getDailyCashPositions(
      clinicId,
      url.searchParams.get('from'),
      url.searchParams.get('to')
    );
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
