import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getMedicalSizeLimit, validateMedicalFile } from '@/lib/services/medicalFiles';

const source = fs.readFileSync(
  path.resolve(__dirname, '../../components/dashboard/patients/PatientFinancialFilesPanel.tsx'),
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
});
