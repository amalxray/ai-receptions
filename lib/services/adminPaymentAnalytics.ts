import { supabaseAdmin } from '@/lib/supabase/admin';

const PAYMENT_PAGE_SIZE = 1000;

type PaymentRow = {
  direction: 'payment' | 'refund';
  amount: number | string;
  created_at: string;
  status: 'recorded' | 'voided';
  voided_at: string | null;
};

type MonthlyNetPayments = {
  month: string;
  amount: number;
};

export type AdminPaymentAnalytics = {
  payments_volume: number;
  monthly_net_payments: MonthlyNetPayments[];
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
  now: Date = new Date(),
): AdminPaymentAnalytics {
  const monthKeys = lastSixMonthKeys(now);
  const monthTotals = new Map(monthKeys.map((month) => [month, 0]));
  let paymentsVolumeCents = 0;

  for (const payment of payments) {
    if (payment.status !== 'recorded' || payment.voided_at !== null) continue;

    const netCents = netAmountCents(payment);
    paymentsVolumeCents += netCents;

    const month = payment.created_at.slice(0, 7);
    if (!monthTotals.has(month)) continue;

    monthTotals.set(month, (monthTotals.get(month) ?? 0) + netCents);
  }

  return {
    payments_volume: paymentsVolumeCents / 100,
    monthly_net_payments: monthKeys.map((month) => ({
      month,
      amount: (monthTotals.get(month) ?? 0) / 100,
    })),
  };
}

export async function getAdminPaymentAnalytics(
  now: Date = new Date(),
): Promise<AdminPaymentAnalytics> {
  const rows: PaymentRow[] = [];
  for (let offset = 0; ; offset += PAYMENT_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('clinic_payments')
      .select('direction, amount, created_at, status, voided_at')
      .eq('status', 'recorded')
      .is('voided_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAYMENT_PAGE_SIZE - 1);
    if (error) throw new Error('Unable to load clinic payments');

    const page = (data ?? []) as PaymentRow[];
    rows.push(...page);
    if (page.length < PAYMENT_PAGE_SIZE) return summarizeAdminPayments(rows, now);
  }
}
