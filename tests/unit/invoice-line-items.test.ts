import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Patient invoice line items.
 *
 * The invoice used to print a hard-coded label — «فاتورة خدمات العيادة (حسب
 * السجل المالي)» — no matter what was billed, so a patient could never see what
 * they paid for. These assertions pin the three moving parts that fix it:
 *   1. issuance builds `items[]` from the service catalog (service_id + qty + price),
 *   2. the printable invoice fetches the invoice's real items,
 *   3. the old label survives ONLY as the fallback for legacy invoices.
 */

const source = fs.readFileSync(
  path.resolve(__dirname, '../../components/dashboard/patients/PatientFinancialFilesPanel.tsx'),
  'utf8'
);

describe('invoice issuance — line items', () => {
  it('loads the clinic service catalog for the picker', () => {
    expect(source).toContain('/api/clinic/services?clinic_id=');
    expect(source).toContain('ServiceOption');
  });

  it('sends service_id + quantity + unit_price per billable line', () => {
    expect(source).toContain('service_id: line.service_id || null');
    expect(source).toContain('quantity: Number(line.quantity)');
    expect(source).toContain('unit_price: Number(line.unit_price)');
    // A line without an amount must never be billed.
    expect(source).toMatch(/item\.unit_price > 0/);
  });

  it('prefills the price from the catalog when a service is picked', () => {
    expect(source).toContain('const pickService = (key: string, serviceId: string)');
    expect(source).toMatch(/service\?\.price \?\? service\?\.price_min/);
  });

  it('shows the running total of the draft lines', () => {
    expect(source).toContain('const draftTotal = invLines.reduce');
    expect(source).toContain('الإجمالي قبل الإصدار');
  });

  it('re-prefills lines when reissuing a voided invoice', () => {
    expect(source).toContain('setInvLines(prefilled)');
    expect(source).toMatch(/item\.service_id \?\? ''/);
  });
});

describe('invoice print — real items with a legacy fallback', () => {
  it('fetches the invoice detail before printing', () => {
    expect(source).toContain('/api/clinic/accounting/invoices/${inv.id}?clinic_id=');
  });

  it('renders a service/qty/price/total table when items exist', () => {
    expect(source).toContain('<th>الخدمة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th>');
    expect(source).toMatch(/Number\(item\.line_total\)\.toFixed\(2\)/);
  });

  it('keeps the generic label ONLY for invoices with no line items', () => {
    const fallbackIndex = source.indexOf('فاتورة خدمات العيادة (حسب السجل المالي)');
    expect(fallbackIndex).toBeGreaterThan(-1);
    // …and it must sit in the `: `<table>` fallback branch, not in the items one.
    const itemsBranchIndex = source.indexOf('${items.map((item) => `<tr>');
    expect(itemsBranchIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(itemsBranchIndex);
  });
});
