import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * B22 — smart upload (upload-start → signed PUT → confirm) regression guard.
 *
 * The confirm route proved THIS org started an upload by looking the session up
 * with `.is('status', 'started')`. PostgREST's `is` operator accepts only
 * null/true/false/unknown, so supabase-js sent `status=is.started` and the API
 * answered 400 PGRST100:
 *   "unexpected \"s\" expecting isVal: (null, not_null, true, false, unknown)"
 * supabase-js surfaces that as `{ data: null, error }`, the route only checked
 * `data`, and EVERY confirm was rejected with
 * "لم يُعثر على جلسة رفع لهذه العيادة" for every tenant — the imaging center
 * included. Only the multipart route (`POST /api/clinic/medical-files`) could
 * still record files, which is why some uploads "worked" and others did not.
 *
 * The mock below emulates PostgREST's `is` semantics on purpose: it reproduces
 * the 400, so this suite FAILS if anyone writes `.is(col, 'string')` again.
 */

const CLINIC_ID = '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5';
const OTHER_CLINIC_ID = 'ab05e3b9-8242-40e5-9392-aa412c8d9af4';
const PATIENT_ID = '4d3a2679-9e01-4ea6-bf61-5d36c07d4c54';
const USER_ID = 'eff8d1ab-ecf5-41ae-95ce-65038ee0023f';
const STORAGE_PATH = `medical/${CLINIC_ID}/${PATIENT_ID}/6dac58e8-2be2-4374-9d75-d449c3ca5915.png`;

const state = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  rejectedFilters: [] as string[],
  confirmCalls: [] as Array<Record<string, unknown>>,
  forceError: null as { code: string; message: string } | null,
}));

/** Faithful emulator of the single PostgREST query the session guard makes. */
function makeQuery(table: string) {
  void table;
  const filters: Array<{ column: string; value: unknown }> = [];
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    is: (column: string, value: unknown) => {
      if (value !== null && typeof value !== 'boolean') {
        // Only null/true/false/unknown are valid `is` values (PGRST100).
        state.rejectedFilters.push(`${column}=is.${String(value)}`);
        return builder;
      }
      filters.push({ column, value });
      return builder;
    },
    maybeSingle: async () => {
      if (state.forceError) return { data: null, error: state.forceError };
      if (state.rejectedFilters.length > 0) {
        return { data: null, error: { code: 'PGRST100', message: 'failed to parse filter' } };
      }
      const row = state.sessions.find((s) => filters.every((f) => s[f.column] === f.value));
      return { data: row ?? null, error: null };
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => makeQuery(table) } }));
vi.mock('@/lib/server/logging', () => ({ logEvent: () => {} }));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: async () => ({ authorized: true, user: { id: USER_ID }, role: 'owner' }),
  roleDenied: () => null,
  ADMIN_ROLES: ['owner', 'manager'],
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'accountant', 'staff'],
}));
vi.mock('@/lib/services/medicalFiles', () => ({
  resolveMedicalFileOrgAccess: async () => ({ ok: true, patient: { id: PATIENT_ID, clinic_id: CLINIC_ID } }),
  confirmMedicalUpload: async (input: Record<string, unknown>) => {
    state.confirmCalls.push(input);
    // Mirrors the service's own `MedicalFileMeta` row shape (snake_case columns).
    return {
      ok: true,
      item: {
        id: 'file-1',
        clinic_id: input.clinicId,
        patient_id: input.patientId,
        storage_path: input.storagePath,
        file_type: input.fileType,
        mime_type: input.mimeType,
        original_filename: input.originalFilename,
      },
    };
  },
}));

import { POST as confirmUpload } from '@/app/api/clinic/medical-files/confirm/route';

const projectRoot = path.resolve(__dirname, '../..');
const confirmSource = fs.readFileSync(path.join(projectRoot, 'app/api/clinic/medical-files/confirm/route.ts'), 'utf8');

/**
 * The guard reads an executable statement, not documentation: the B22 comment in
 * the route quotes the very bug (`is('status', 'started')`), so comments are
 * stripped before matching.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const confirmCode = stripComments(confirmSource);

const validBody = {
  clinic_id: CLINIC_ID,
  patient_id: PATIENT_ID,
  storage_path: STORAGE_PATH,
  mime_type: 'image/png',
  size_bytes: 2033624,
  filename: 'ابو_خليل_فريتخ_20260928_134218.png',
  file_type: 'image',
};

const confirmRequest = (body: Record<string, unknown> = validBody) =>
  new Request('http://localhost/api/clinic/medical-files/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('B22 — PostgREST emulator fidelity (documents why the old code broke)', () => {
  beforeEach(() => {
    state.sessions = [];
    state.rejectedFilters = [];
    state.forceError = null;
  });

  it("rejects `status=is.started` with PGRST100, exactly like the live API does", async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const result = await (supabaseAdmin as any)
      .from('medical_upload_sessions')
      .select('id, status')
      .is('status', 'started')
      .maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('PGRST100');
    expect(state.rejectedFilters).toEqual(['status=is.started']);
  });
});

describe('B22 — confirm accepts the upload session this org started', () => {
  beforeEach(() => {
    state.rejectedFilters = [];
    state.confirmCalls = [];
    state.forceError = null;
    state.sessions = [
      { id: 'session-1', clinic_id: CLINIC_ID, storage_path: STORAGE_PATH, status: 'started' },
    ];
  });

  it('records the file (201) instead of answering "لم يُعثر على جلسة رفع"', async () => {
    const res = await confirmUpload(confirmRequest());
    const json = (await res.json()) as { data?: { storage_path?: string } };
    expect(res.status).toBe(201);
    expect(json.data?.storage_path).toBe(STORAGE_PATH);
    expect(state.confirmCalls).toHaveLength(1);
    expect(state.confirmCalls[0].clinicId).toBe(CLINIC_ID);
    expect(state.rejectedFilters).toEqual([]); // no invalid `is` filter was ever sent
  });

  it('keeps the IDOR guard: a path nobody started is still refused (403)', async () => {
    state.sessions = [];
    const res = await confirmUpload(confirmRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('لم يُعثر على جلسة رفع');
    expect(state.confirmCalls).toHaveLength(0);
  });

  it("keeps tenant isolation: another clinic's session on the same path is refused", async () => {
    state.sessions = [
      { id: 'session-2', clinic_id: OTHER_CLINIC_ID, storage_path: STORAGE_PATH, status: 'started' },
    ];
    const res = await confirmUpload(confirmRequest());
    expect(res.status).toBe(403);
    expect(state.confirmCalls).toHaveLength(0);
  });

  it('a finished/expired session no longer counts as started', async () => {
    state.sessions = [
      { id: 'session-3', clinic_id: CLINIC_ID, storage_path: STORAGE_PATH, status: 'orphan' },
    ];
    const res = await confirmUpload(confirmRequest());
    expect(res.status).toBe(403);
  });

  it('a session-lookup DATABASE error is a 500, never a misleading "no session" (B22 hardening)', async () => {
    state.forceError = { code: 'PGRST100', message: 'failed to parse filter' };
    const res = await confirmUpload(confirmRequest());
    const json = (await res.json()) as { error?: string };
    expect(res.status).toBe(500);
    expect(json.error).not.toContain('لم يُعثر على جلسة رفع');
    expect(state.confirmCalls).toHaveLength(0);
  });
});

describe('B22 — source guard', () => {
  it('never uses `.is()` for a status filter (only null/booleans are valid)', () => {
    expect(confirmCode).not.toMatch(/\.is\('status'/);
    expect(confirmCode).toContain(".eq('status', 'started')");
    // the comment that documents the bug is still there
    expect(confirmSource).toContain("is('status', 'started')");
  });

  it('treats a session.error as an error response, not as "no session"', () => {
    expect(confirmCode).toContain('if (session.error)');
  });
});
