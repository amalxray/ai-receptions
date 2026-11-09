import { NextResponse } from 'next/server';
import { getUserPermissionState, hasPermission, ROLE_DEFAULTS } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { getZonedDayBounds } from '@/lib/services/clinicDay';
import { logEvent } from '@/lib/server/logging';

const CLINIC_TIME_ZONE = 'Asia/Jerusalem';
const PAGE_SIZE = 500;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function canReadFinancialStats(userId: string, clinicId: string, role: string): Promise<boolean> {
  try {
    const state = await getUserPermissionState(userId, clinicId, role);
    const explicit = state.overrides.get('view_financial');
    if (explicit === false) return false;
    if (explicit === true) return true;
    return FINANCE_READ_ROLES.includes(role) || hasPermission(state.permissions, 'view_financial');
  } catch {
    return FINANCE_READ_ROLES.includes(role) || (ROLE_DEFAULTS[role] ?? []).includes('view_financial');
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const { start, end } = getZonedDayBounds(CLINIC_TIME_ZONE);
    const canReadFinance = await canReadFinancialStats(
      authorization.user.id,
      clinicId,
      authorization.role
    );

    const patientCountQuery = supabaseAdmin
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());

    const [patientCountResult, financialResults] = await Promise.all([
      patientCountQuery,
      canReadFinance
        ? Promise.allSettled([
            fetchAllPages((from, to) =>
              supabaseAdmin
                .from('clinic_invoices')
                .select('total')
                .eq('clinic_id', clinicId)
                .neq('status', 'voided')
                .gte('issued_at', start.toISOString())
                .lt('issued_at', end.toISOString())
                .order('id', { ascending: true })
                .range(from, to)
            ),
            fetchAllPages((from, to) =>
              supabaseAdmin
                .from('clinic_payments')
                .select('amount')
                .eq('clinic_id', clinicId)
                .eq('status', 'recorded')
                .eq('direction', 'payment')
                .gte('created_at', start.toISOString())
                .lt('created_at', end.toISOString())
                .order('id', { ascending: true })
                .range(from, to)
            ),
          ])
        : Promise.resolve(null),
    ]);

    if (patientCountResult.error) throw new Error(patientCountResult.error.message);

    let invoicesTotal: number | null = null;
    let paymentsTotal: number | null = null;
    let remainingTotal: number | null = null;

    if (financialResults) {
      const [invoicesResult, paymentsResult] = financialResults;
      const invoiceError = invoicesResult.status === 'rejected' ? invoicesResult.reason : null;
      const paymentError = paymentsResult.status === 'rejected' ? paymentsResult.reason : null;

      if (invoiceError || paymentError) {
        logEvent(
          'clinic_patients_today_financial_stats_error',
          {
            clinic_id: clinicId,
            invoice_error: invoiceError ? String(invoiceError) : null,
            payment_error: paymentError ? String(paymentError) : null,
          },
          'error'
        );
      } else {
        const invoiceRows = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
        const paymentRows = paymentsResult.status === 'fulfilled' ? paymentsResult.value : [];
        invoicesTotal = invoiceRows.reduce((total, row) => total + Number(row.total ?? 0), 0);
        paymentsTotal = paymentRows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
        remainingTotal = invoicesTotal - paymentsTotal;
      }
    }

    return NextResponse.json({
      data: {
        new_patients: patientCountResult.count ?? 0,
        invoices_total: invoicesTotal,
        payments_total: paymentsTotal,
        remaining_total: remainingTotal,
      },
    });
  } catch (error) {
    logEvent(
      'clinic_patients_today_stats_error',
      { error: error instanceof Error ? error.message : String(error) },
      'error'
    );
    return NextResponse.json({ error: 'تعذر تحميل أداء اليوم.' }, { status: 500 });
  }
}
