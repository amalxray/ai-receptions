import { describe, expect, it } from 'vitest';
import { isPdfMedicalFile } from '@/components/dashboard/patients/PatientPdfPreviewButton';

describe('isPdfMedicalFile', () => {
  it('recognizes persisted PDF file types', () => {
    expect(isPdfMedicalFile({ file_type: 'pdf' })).toBe(true);
    expect(isPdfMedicalFile({ file_type: 'PDF' })).toBe(true);
  });

  it('recognizes PDF MIME types and filenames when the type is generic', () => {
    expect(isPdfMedicalFile({ file_type: 'document', mime_type: 'application/pdf' })).toBe(true);
    expect(isPdfMedicalFile({ original_filename: 'report.PDF' })).toBe(true);
  });

  it('does not offer PDF preview for other files', () => {
    expect(isPdfMedicalFile({ file_type: 'image', mime_type: 'image/png', original_filename: 'scan.png' })).toBe(false);
    expect(isPdfMedicalFile({ file_type: 'medical_report' })).toBe(false);
    expect(isPdfMedicalFile({})).toBe(false);
  });
});
