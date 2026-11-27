import { supabaseAdmin } from '@/lib/supabase/admin';

const PAYMENT_PAGE_SIZE = 1000;
const TOP_CLINICS_LIMIT = 10;

type PaymentRow = {
  clinic_id: string;
  direction: 'payment' | 'refund';
  amount: number | string;
  created_at: string;
  status: 'recorded' | 'voided';
  voided_at: string | null;
};

type ClinicRow = {
  id: string;
  name: string;
  slug: string;
};

type MonthlyNetPayments = {
  month: string;
  amount: number;
};

type ClinicNetPayments = {
  clinic_id: string;
  clinic_name: string;
  clinic_slug: string;
  amount: number;
};

export type AdminPaymentAnalytics = {
  payments_volume: number;
  monthly_net_payments: MonthlyNetPayments[];
  clinic_net_payments: ClinicNetPayments[];
  top_clinics_by_net_payments: ClinicNetPayments[];
};

function lastSixMonthKeys(now: Date): string[] {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

function netAmountCents(payment: PaymentRow): number {
  if (payment.status !== 'recorded' || payment.voided_at !== null) return 0;

  const amount = Number(payment.amount);
  if (!Number.isFinite(amount)) throw new Error('Invalid clinic payment amount');
  const amountCents = Math.round(amount * 100);
  if (payment.direction === 'payment') return amountCents;
  if (payment.direction === 'refund') return -amountCents;
  throw new Error('Invalid clinic payment direction');
}

export function summarizeAdminPayments(
  payments: PaymentRow[],
  clinics: ClinicRow[],
  now: Date = new Date(),
): AdminPaymentAnalytics {
  const monthKeys = lastSixMonthKeys(now);
  const monthTotals = new Map(monthKeys.map((month) => [month, 0]));
  const clinicTotals = new Map(clinics.map((clinic) => [clinic.id, 0]));
  const clinicById = new Map(clinics.map((clinic) => [clinic.id, clinic]));
  let paymentsVolumeCents = 0;

  for (const payment of payments) {
    if (payment.status !== 'recorded' || payment.voided_at !== null) continue;

    const netCents = netAmountCents(payment);
    paymentsVolumeCents += netCents;

    const month = payment.created_at.slice(0, 7);
    if (!monthTotals.has(month)) continue;

    monthTotals.set(month, (monthTotals.get(month) ?? 0) + netCents);
    clinicTotals.set(payment.clinic_id, (clinicTotals.get(payment.clinic_id) ?? 0) + netCents);
  }

  const clinicNetPayments = Array.from(clinicTotals, ([clinicId, amount]) => {
    const clinic = clinicById.get(clinicId);
    return {
      clinic_id: clinicId,
      clinic_name: clinic?.name ?? 'عيادة غير معروفة',
      clinic_slug: clinic?.slug ?? '',
      amount: amount / 100,
    };
  }).sort((left, right) => right.amount - left.amount);

  return {
    payments_volume: paymentsVolumeCents / 100,
    monthly_net_payments: monthKeys.map((month) => ({
      month,
      amount: (monthTotals.get(month) ?? 0) / 100,
    })),
    clinic_net_payments: clinicNetPayments,
    top_clinics_by_net_payments: clinicNetPayments.slice(0, TOP_CLINICS_LIMIT),
  };
}

export async function getAdminPaymentAnalytics(
  now: Date = new Date(),
): Promise<AdminPaymentAnalytics> {
  const [clinicsResult, payments] = await Promise.all([
    supabaseAdmin
      .from('clinics')
      .select('id, name, slug')
      .is('deleted_at', null),
    (async () => {
      const rows: PaymentRow[] = [];
      for (let offset = 0; ; offset += PAYMENT_PAGE_SIZE) {
        const { data, error } = await supabaseAdmin
          .from('clinic_payments')
          .select('clinic_id, direction, amount, created_at, status, voided_at')
          .eq('status', 'recorded')
          .is('voided_at', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAYMENT_PAGE_SIZE - 1);
        if (error) throw new Error('Unable to load clinic payments');

        const page = (data ?? []) as PaymentRow[];
        rows.push(...page);
        if (page.length < PAYMENT_PAGE_SIZE) return rows;
      }
    })(),
  ]);

  if (clinicsResult.error) throw new Error('Unable to load clinics for payment analytics');
  return summarizeAdminPayments((payments ?? []) as PaymentRow[], (clinicsResult.data ?? []) as ClinicRow[], now);
}
