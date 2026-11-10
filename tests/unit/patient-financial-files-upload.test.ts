import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getMedicalSizeLimit, validateMedicalFile } from '@/lib/services/medicalFiles';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../components/dashboard/patients/PatientFinancialFilesPanel.tsx'),
  'utf8'
);
const financialIntelligencePage = fs.readFileSync(
  path.resolve(__dirname, '../../app/(dashboard)/dashboard/[clinicSlug]/financial-intelligence/page.tsx'),
  'utf8'
);

describe('patient financial-panel medical file uploads', () => {
  it('uses the signed direct-storage upload and confirmation flow', () => {
    expect(source).toContain("fetch('/api/clinic/medical-files/upload-start'");
    expect(source).toContain("xhr.open('PUT', upload_url, true)");
    expect(source).toContain("fetch('/api/clinic/medical-files/confirm'");
    expect(source).not.toContain("fetch(`/api/clinic/medical-files?clinic_id=");
    expect(source).not.toContain('4 * 1024 * 1024');
  });

  it('accepts a 5.9 MiB PDF under the medical-file server limit', () => {
    const fileSize = Math.round(5.9 * 1024 * 1024);
    expect(fileSize).toBeLessThan(getMedicalSizeLimit('pdf'));
    expect(validateMedicalFile({ name: 'patient-report.pdf', type: 'application/pdf', size: fileSize })).toMatchObject({
      ok: true,
      type: 'pdf',
    });
    expect(fileSize).toBeLessThan(getMedicalSizeLimit('image'));
    expect(validateMedicalFile({ name: 'patient-xray.jpg', type: 'image/jpeg', size: fileSize })).toMatchObject({
      ok: true,
      type: 'image',
    });
  });

  it('retains the configured medical-image limit for DICOM studies', () => {
    expect(getMedicalSizeLimit('medical_image')).toBeGreaterThanOrEqual(2 * 1024 * 1024 * 1024);
  });

  it('refreshes only invoices and balances after issuing an invoice', () => {
    const issueInvoiceStart = source.indexOf('const issueInvoice = async () => {');
    const issueInvoiceEnd = source.indexOf('/** Opens the void dialog', issueInvoiceStart);
    const issueInvoiceHandler = source.slice(issueInvoiceStart, issueInvoiceEnd);

    expect(issueInvoiceHandler).toContain('Promise.allSettled([loadInvoices(), loadBalances()])');
    expect(issueInvoiceHandler).not.toContain('await loadAll()');
  });

  it('requests patient-scoped payments and loads the comparison periods concurrently', () => {
    expect(source).toContain('/api/clinic/accounting/payments?clinic_id=${clinicId}&patient_id=${patientId}');
    expect(financialIntelligencePage).toContain('const [current, prior] = await Promise.all([');
    expect(financialIntelligencePage).toContain('fetchRange(previousRange(range, months)).catch(() => null)');
  });
});
