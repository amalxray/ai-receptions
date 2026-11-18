import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  permissionDenied: vi.fn(),
  resolveMedicalFileOrgAccess: vi.fn(),
  createMedicalUploadIntent: vi.fn(),
  uploadMedicalFile: vi.fn(),
  supabaseRows: [] as Array<Record<string, unknown>>,
  queryLimits: [] as number[],
  queryOrFilters: [] as string[],
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
}));
vi.mock('@/lib/services/permissionGate', () => ({
  permissionDenied: mocks.permissionDenied,
}));
vi.mock('@/lib/services/medicalFiles', () => ({
  parseMedicalFilesPage: (url: URL) => {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 200 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;
    const created_at = url.searchParams.get('cursor_created_at');
    const id = url.searchParams.get('cursor_id');
    if ((created_at === null) !== (id === null)) return null;
    return { limit, cursor: created_at && id ? { created_at, id } : null };
  },
  buildMedicalFilesPage: (rows: Array<Record<string, unknown>>, limit: number) => {
    const has_more = rows.length > limit;
    const data = has_more ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    return {
      data,
      has_more,
      next_cursor: has_more && last?.created_at
        ? { created_at: last.created_at, id: last.id }
        : null,
    };
  },
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
      query.limit = vi.fn((limit: number) => {
        mocks.queryLimits.push(limit);
        return query;
      });
      query.or = vi.fn((filter: string) => {
        mocks.queryOrFilters.push(filter);
        return query;
      });
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
  mocks.queryLimits = [];
  mocks.queryOrFilters = [];
});

describe('patient medical file permissions', () => {
  it('uses view_medical_files for patient file listings', async () => {
    const res = await listFiles(
      authedRequest('http://localhost/api/clinic/medical-files/list?clinic_id=' + CLINIC + '&patient_id=' + PATIENT)
    );

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'view_medical_files');
  });

  it('paginates all 250 files across three cursor-based requests without duplicates', async () => {
    const files = Array.from({ length: 250 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 250 - index)).toISOString(),
    }));
    mocks.supabaseRows = files.slice(0, 101);

    const firstResponse = await listFiles(
      authedRequest(`http://localhost/api/clinic/medical-files/list?clinic_id=${CLINIC}&limit=100`)
    );
    const first = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(first.data).toHaveLength(100);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toEqual({ created_at: files[99].created_at, id: files[99].id });

    mocks.supabaseRows = files.slice(100, 201);
    const secondResponse = await listFiles(authedRequest(
      `http://localhost/api/clinic/medical-files/list?clinic_id=${CLINIC}&limit=100&cursor_created_at=${encodeURIComponent(first.next_cursor.created_at)}&cursor_id=${first.next_cursor.id}`,
    ));
    const second = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(second.data).toHaveLength(100);
    expect(second.has_more).toBe(true);
    expect(second.next_cursor).toEqual({ created_at: files[199].created_at, id: files[199].id });

    mocks.supabaseRows = files.slice(200);
    const thirdResponse = await listFiles(authedRequest(
      `http://localhost/api/clinic/medical-files/list?clinic_id=${CLINIC}&limit=100&cursor_created_at=${encodeURIComponent(second.next_cursor.created_at)}&cursor_id=${second.next_cursor.id}`,
    ));
    const third = await thirdResponse.json();
    expect(thirdResponse.status).toBe(200);
    expect(third.data).toHaveLength(50);
    expect(third.has_more).toBe(false);
    expect(third.next_cursor).toBeNull();
    expect([...first.data, ...second.data, ...third.data].map((file) => file.id)).toEqual(files.map((file) => file.id));
    expect(mocks.queryLimits).toEqual([101, 101, 101]);
    expect(mocks.queryOrFilters).toHaveLength(2);
  });

  it('rejects invalid pagination cursors instead of silently returning a truncated list', async () => {
    const res = await listFiles(
      authedRequest(`http://localhost/api/clinic/medical-files/list?clinic_id=${CLINIC}&limit=500`)
    );
    expect(res.status).toBe(400);
    expect(mocks.permissionDenied).not.toHaveBeenCalled();
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
        client_upload_id: '55555555-5555-4555-8555-555555555555',
        filename: 'panorama.png',
        mime_type: 'image/png',
        size_bytes: 100,
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.permissionDenied).toHaveBeenCalledWith(expect.any(Request), CLINIC, 'manage_medical_files');
    expect(mocks.createMedicalUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({ clientUploadId: '55555555-5555-4555-8555-555555555555' }),
    );
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
