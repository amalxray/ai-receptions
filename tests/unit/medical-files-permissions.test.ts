import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  permissionDenied: vi.fn(),
  resolveMedicalFileOrgAccess: vi.fn(),
  createMedicalUploadIntent: vi.fn(),
  uploadMedicalFile: vi.fn(),
  supabaseRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
}));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mocks.permissionDenied,
}));
vi.mock('@/lib/services/medicalFiles', () => ({
  resolveMedicalFileOrgAccess: mocks.resolveMedicalFileOrgAccess,
  createMedicalUploadIntent: mocks.createMedicalUploadIntent,
  uploadMedicalFile: mocks.uploadMedicalFile,
  signMedicalFileUrl: vi.fn(),
  deleteMedicalFileById: vi.fn(),
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const query: any = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.limit = vi.fn(() => query);
      query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: mocks.supabaseRows, error: null }).then(resolve, reject);
      return query;
    }),
  },
}));

import { GET as listFiles } from '@/app/api/clinic/medical-files/list/route';
import { GET as getPatientFiles, POST as uploadPatientFile } from '@/app/api/clinic/medical-files/route';
import { GET as getFile, DELETE as deleteFile } from '@/app/api/clinic/medical-files/[fileId]/route';
import { POST as startUpload } from '@/app/api/clinic/medical-files/upload-start/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PATIENT = '22222222-2222-2222-2222-222222222222';
const FILE_ID = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';

function authedRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: { authorization: 'Bearer member-token', ...init.headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeClinicRequest.mockResolvedValue({
    authorized: true,
    user: { id: USER },
    role: 'receptionist',
  });
  mocks.permissionDenied.mockResolvedValue(null);
  mocks.resolveMedicalFileOrgAccess.mockResolvedValue({
    ok: true,
    patient: { id: PATIENT, clinic_id: CLINIC },
  });
  mocks.createMedicalUploadIntent.mockResolvedValue({
    ok: true,
    storagePath: 'medical/clinic/patient/file.png',
    uploadUrl: 'https://storage.example.test/upload',
    token: 'upload-token',
    fileType: 'image',
    medicalCategory: 'panorama',
    maxBytes: 1000,
  });
  mocks.uploadMedicalFile.mockResolvedValue({ ok: true, item: { id: FILE_ID } });
  mocks.supabaseRows = [];
});

describe('patient medical file permissions', () => {
  it('uses view_medical_files for patient file listings', async () => {
    const res = await listFiles(
      authedRequest('http://localhost/api/clinic/medical-files/list?clinic_id=' + CLINIC + '&patient_id=' + PATIENT)
    );

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'view_medical_files');
  });

  it('uses view_medical_files for the direct patient-file listing API', async () => {
    const res = await getPatientFiles(
      authedRequest('http://localhost/api/clinic/medical-files?clinic_id=' + CLINIC + '&patient_id=' + PATIENT)
    );

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'view_medical_files');
  });

  it('uses manage_medical_files for the signed-upload start', async () => {
    const res = await startUpload(authedRequest('http://localhost/api/clinic/medical-files/upload-start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clinic_id: CLINIC,
        patient_id: PATIENT,
        filename: 'panorama.png',
        mime_type: 'image/png',
        size_bytes: 100,
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_medical_files');
  });

  it('uses manage_medical_files for direct multipart uploads', async () => {
    const form = new FormData();
    form.set('patient_id', PATIENT);
    form.set('file', new File(['scan'], 'scan.png', { type: 'image/png' }));
    const res = await uploadPatientFile(
      authedRequest('http://localhost/api/clinic/medical-files?clinic_id=' + CLINIC, {
        method: 'POST',
        body: form,
      })
    );

    expect(res.status).toBe(201);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_medical_files');
  });

  it('uses view_medical_files for signed file reads', async () => {
    mocks.permissionDenied.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );
    const res = await getFile(
      authedRequest('http://localhost/api/clinic/medical-files/' + FILE_ID + '?clinic_id=' + CLINIC),
      { params: { fileId: FILE_ID } }
    );

    expect(res.status).toBe(403);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'view_medical_files');
  });

  it('uses manage_medical_files for file deletion', async () => {
    mocks.permissionDenied.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    );
    const res = await deleteFile(
      authedRequest('http://localhost/api/clinic/medical-files/' + FILE_ID + '?clinic_id=' + CLINIC, { method: 'DELETE' }),
      { params: { fileId: FILE_ID } }
    );

    expect(res.status).toBe(403);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_medical_files');
  });
});
