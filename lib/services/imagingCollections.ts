import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveCanonicalServiceIds } from '@/lib/services/clinicServiceCatalog';
import { logEvent } from '@/lib/server/logging';
import type { PeriodRange } from './reporting';

const PAGE_SIZE = 1000;
const INVOICE_BATCH_SIZE = 100;
const UTC_BOUNDARY_PADDING_DAYS = 2;

type PaymentRow = {
  invoice_id: string;
  amount: number | string;
  direction: 'payment' | 'refund' | string;
  status: string;
  created_at: string;
};

type InvoiceItemRow = {
  invoice_id: string;
  service_id: string | null;
};

function isImagingOnlyInvoice(
  invoiceId: string,
  itemsByInvoice: Map<string, InvoiceItemRow[]>,
  imagingServiceIds: ReadonlySet<string>,
): boolean {
  const items = itemsByInvoice.get(invoiceId) ?? [];
  return items.length > 0 && items.every((item) => item.service_id !== null && imagingServiceIds.has(item.service_id));
}

function paymentMonth(paymentDate: string, timeZone: string): string {
  const timestamp = new Date(paymentDate);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('IMAGING_PAYMENT_DATE_INVALID');

  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('IMAGING_PAYMENT_DATE_INVALID');
  return `${year}-${month}-01`;
}

export function calculateImagingCollected(
  payments: readonly PaymentRow[],
  invoiceItems: readonly InvoiceItemRow[],
  imagingServiceIds: ReadonlySet<string>,
  range: PeriodRange,
  timeZone = 'UTC',
): number {
  const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
  for (const item of invoiceItems) {
    const items = itemsByInvoice.get(item.invoice_id) ?? [];
    items.push(item);
    itemsByInvoice.set(item.invoice_id, items);
  }

  let total = 0;
  for (const payment of payments) {
    if (payment.status !== 'recorded' || !['payment', 'refund'].includes(payment.direction)) continue;
    if (!isImagingOnlyInvoice(payment.invoice_id, itemsByInvoice, imagingServiceIds)) continue;

    const month = paymentMonth(payment.created_at, timeZone);
    if (range.fromMonth && month < range.fromMonth) continue;
    if (range.toMonth && month > range.toMonth) continue;

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('IMAGING_PAYMENT_AMOUNT_INVALID');
    total += payment.direction === 'refund' ? -amount : amount;
  }

  return Math.round(total * 100) / 100;
}

function queryBounds(range: PeriodRange): { from?: string; to?: string } {
  const from = range.fromMonth ? new Date(`${range.fromMonth}T00:00:00.000Z`) : undefined;
  if (from) from.setUTCDate(from.getUTCDate() - UTC_BOUNDARY_PADDING_DAYS);

  const to = range.toMonth ? new Date(`${range.toMonth}T00:00:00.000Z`) : undefined;
  if (to) {
    to.setUTCMonth(to.getUTCMonth() + 1);
    to.setUTCDate(to.getUTCDate() + UTC_BOUNDARY_PADDING_DAYS);
  }

  return {
    from: from?.toISOString(),
    to: to?.toISOString(),
  };
}

async function loadPayments(clinicId: string, range: PeriodRange): Promise<PaymentRow[]> {
  const bounds = queryBounds(range);
  const payments: PaymentRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('clinic_payments')
      .select('invoice_id, amount, direction, status, created_at')
      .eq('clinic_id', clinicId)
      .eq('status', 'recorded')
      .in('direction', ['payment', 'refund'])
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (bounds.from) query = query.gte('created_at', bounds.from);
    if (bounds.to) query = query.lt('created_at', bounds.to);

    const { data, error } = await query;
    if (error) {
      logEvent('fi_imaging_collections_payments_error', {
        clinic_id: clinicId,
        error: error.message,
      }, 'error');
      throw new Error(error.message);
    }

    const page = (data ?? []) as PaymentRow[];
    payments.push(...page);
    if (page.length < PAGE_SIZE) return payments;
  }
}

async function loadInvoiceItems(clinicId: string, invoiceIds: string[]): Promise<InvoiceItemRow[]> {
  const items: InvoiceItemRow[] = [];

  for (let batchStart = 0; batchStart < invoiceIds.length; batchStart += INVOICE_BATCH_SIZE) {
    const invoiceBatch = invoiceIds.slice(batchStart, batchStart + INVOICE_BATCH_SIZE);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('invoice_items')
        .select('invoice_id, service_id')
        .eq('clinic_id', clinicId)
        .in('invoice_id', invoiceBatch)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        logEvent('fi_imaging_collections_invoice_items_error', {
          clinic_id: clinicId,
          error: error.message,
        }, 'error');
        throw new Error(error.message);
      }

      const page = (data ?? []) as InvoiceItemRow[];
      items.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return items;
}

export async function getImagingCollected(clinicId: string, range: PeriodRange = {}): Promise<number> {
  const [{ data: imagingServices, error: imagingServicesError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabaseAdmin.from('imaging_services').select('id').eq('clinic_id', clinicId),
      supabaseAdmin.from('clinic_settings').select('timezone').eq('clinic_id', clinicId).maybeSingle(),
    ]);

  if (imagingServicesError) {
    logEvent('fi_imaging_collections_services_error', {
      clinic_id: clinicId,
      error: imagingServicesError.message,
    }, 'error');
    throw new Error(imagingServicesError.message);
  }
  if (settingsError) {
    logEvent('fi_imaging_collections_timezone_error', {
      clinic_id: clinicId,
      error: settingsError.message,
    }, 'error');
    throw new Error(settingsError.message);
  }

  const imagingServiceIds = new Set<string>();
  const serviceIds = (imagingServices ?? []).map((service) => String(service.id));
  if (serviceIds.length > 0) {
    const resolutions = await resolveCanonicalServiceIds(clinicId, serviceIds);
    for (const resolution of Array.from(resolutions.values())) {
      if (resolution.canonical) imagingServiceIds.add(resolution.canonical);
    }
  }
  if (imagingServiceIds.size === 0) return 0;

  const payments = await loadPayments(clinicId, range);
  if (payments.length === 0) return 0;

  const invoiceIds = Array.from(new Set(payments.map((payment) => payment.invoice_id)));
  const invoiceItems = await loadInvoiceItems(clinicId, invoiceIds);
  return calculateImagingCollected(
    payments,
    invoiceItems,
    imagingServiceIds,
    range,
    settings?.timezone || 'UTC',
  );
}
