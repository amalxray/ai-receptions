import { describe, it, expect } from 'vitest';
import {
  detectFileCategory,
  formatFileSize,
  CATEGORY_METAS,
  type MedicalCategory,
} from '@/components/dashboard/patients/PatientMedicalFilesTab';
import { getAllMedicalSizeLimits, getMedicalSizeLimit } from '@/lib/services/medicalFiles';

/**
 * PATIENT MEDICAL FILES TAB tests.
 *
 * The tab is the clinic-side surface for radiology assets (panorama / CBCT /
 * DICOM / reports). It must:
 *  - bucket every file the server can persist into a colour-coded category,
 *  - never lose a file (unknown shapes fall back to `other`, not to nothing),
 *  - render human-readable sizes for study-grade files up to 2 GiB,
 *  - stay in sync with the validation ceilings in lib/services/medicalFiles.
 *
 * `getAllMedicalSizeLimits()` is the runtime source of truth for the persisted
 * `MedicalFileType` set (the API routes keep their zod enum private).
 */
const PERSISTED_FILE_TYPES = Object.keys(getAllMedicalSizeLimits());

describe('formatFileSize', () => {
  it('labels raw bytes below 1 KiB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('scales to KB / MB with sensible precision', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('2 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('renders study-grade files in GB (CBCT / DICOM studies)', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
    expect(formatFileSize(1536 * 1024 * 1024)).toBe('1.50 GB');
  });

  it('degrades gracefully for missing or nonsensical sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(Number.NaN)).toBe('0 B');
  });
});

describe('detectFileCategory', () => {
  it('detects panorama studies from latin and arabic filename hints', () => {
    expect(detectFileCategory('image', 'panorama_2026.jpg', 'image/jpeg')).toBe('panorama');
    expect(detectFileCategory('image', 'PANO-01.png', 'image/png')).toBe('panorama');
    expect(detectFileCategory('image', 'opg_full.jpg', 'image/jpeg')).toBe('panorama');
    expect(detectFileCategory('image', 'صورة بانوراما.jpg', 'image/jpeg')).toBe('panorama');
    expect(detectFileCategory('image', 'panoramic-view.webp', 'image/webp')).toBe('panorama');
  });

  it('detects CBCT / 3D cone-beam studies', () => {
    expect(detectFileCategory('medical_image', 'cbct_lower_jaw.dcm', 'application/dicom')).toBe('cbct');
    expect(detectFileCategory('document', '3d reconstruction.zip', 'application/zip')).toBe('cbct');
    expect(detectFileCategory('document', 'دراسة مخروطي.zip', 'application/zip')).toBe('cbct');
    expect(detectFileCategory('document', 'cone beam study', 'application/octet-stream')).toBe('cbct');
  });

  it('detects DICOM by file type, extension, and MIME type', () => {
    expect(detectFileCategory('medical_image', 'mandible', 'application/octet-stream')).toBe('dicom');
    expect(detectFileCategory('document', 'series-001.dcm', 'application/octet-stream')).toBe('dicom');
    expect(detectFileCategory('document', 'study.bin', 'application/dicom')).toBe('dicom');
    expect(detectFileCategory('document', 'study.bin', 'APPLICATION/DICOM')).toBe('dicom');
  });

  it('detects medical reports from file type, MIME, latin and arabic names', () => {
    expect(detectFileCategory('pdf', 'anything.bin', 'application/octet-stream')).toBe('report');
    expect(detectFileCategory('medical_report', 'anything.bin', null)).toBe('report');
    expect(detectFileCategory('document', 'notes.txt', 'application/pdf')).toBe('report');
    expect(detectFileCategory('document', 'تقرير-الأشعة.pdf', 'application/pdf')).toBe('report');
    expect(detectFileCategory('image', 'blood_report.jpg', 'image/jpeg')).toBe('report');
  });

  it('falls back to `other` for plain images and documents — nothing is ever lost', () => {
    expect(detectFileCategory('image', 'intraoral_shot.jpg', 'image/jpeg')).toBe('other');
    expect(detectFileCategory('video', 'consult.mp4', 'video/mp4')).toBe('other');
    expect(detectFileCategory('document', 'id-card.png', null)).toBe('other');
  });

  it('handles a missing filename or MIME without throwing', () => {
    expect(detectFileCategory('image', null, null)).toBe('other');
    expect(detectFileCategory('image', undefined, undefined)).toBe('other');
    expect(detectFileCategory('image', '', '')).toBe('other');
  });

  it('applies a stable precedence: panorama > cbct > dicom > report', () => {
    // A panorama exported as DICOM is still a panorama study for the clinician.
    expect(detectFileCategory('medical_image', 'panorama.dcm', 'application/dicom')).toBe('panorama');
    // A CBCT export is CBCT, not generic DICOM.
    expect(detectFileCategory('medical_image', 'cbct_fov.dcm', 'application/dicom')).toBe('cbct');
    // DICOM wins over the report rule when no report hint exists.
    expect(detectFileCategory('medical_image', 'scan.dcm', 'application/dicom')).toBe('dicom');
  });

  it('is case-insensitive on filename and MIME', () => {
    expect(detectFileCategory('IMAGE', 'CBCT_UPPER.DCM', 'APPLICATION/DICOM')).toBe('cbct');
    expect(detectFileCategory('PDF', 'REPORT.PDF', 'APPLICATION/PDF')).toBe('report');
  });
});

describe('category ↔ server contract', () => {
  it('buckets every persisted MedicalFileType into a real category', () => {
    const valid = new Set<MedicalCategory>(Object.keys(CATEGORY_METAS) as MedicalCategory[]);
    expect(PERSISTED_FILE_TYPES.length).toBeGreaterThan(0);
    for (const fileType of PERSISTED_FILE_TYPES) {
      const category = detectFileCategory(fileType, null, null);
      expect(valid.has(category), `${fileType} → ${category}`).toBe(true);
      expect(category).not.toBe('all'); // `all` is a filter, never a bucket
    }
  });

  it('exposes a colour-coded meta entry for every filter key, including `all`', () => {
    const required: MedicalCategory[] = ['all', 'panorama', 'cbct', 'dicom', 'report', 'other'];
    expect(Object.keys(CATEGORY_METAS).sort()).toEqual([...required].sort());
    for (const key of required) {
      const meta = CATEGORY_METAS[key];
      expect(meta.label.length, `${key} needs an arabic label`).toBeGreaterThan(0);
      expect(meta.border).toMatch(/^border-/);
      expect(meta.bgBadge.length).toBeGreaterThan(0);
      expect(meta.textBadge.length).toBeGreaterThan(0);
      expect(meta.iconBg.length).toBeGreaterThan(0);
      expect(meta.glow.length).toBeGreaterThan(0);
    }
  });

  it('keeps distinct colours per clinical category (no duplicate badges)', () => {
    const buckets: MedicalCategory[] = ['panorama', 'cbct', 'dicom', 'report', 'other'];
    const badges = buckets.map((b) => CATEGORY_METAS[b].bgBadge);
    expect(new Set(badges).size).toBe(badges.length);
  });
});

describe('upload ceilings mirror the server-side validation', () => {
  it('advertises a 2 GiB direct-upload ceiling for DICOM medical images', () => {
    expect(getMedicalSizeLimit('medical_image')).toBe(2 * 1024 * 1024 * 1024);
  });

  it('keeps medical images the largest accepted class (study-grade uploads)', () => {
    const limits = getAllMedicalSizeLimits();
    for (const [type, limit] of Object.entries(limits)) {
      if (type === 'medical_image') continue;
      expect(limits.medical_image).toBeGreaterThan(limit);
    }
  });
});
