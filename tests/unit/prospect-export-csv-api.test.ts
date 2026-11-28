import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  backup: vi.fn(),
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => state.authorized
    ? { ok: true, admin: { id: 'admin', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' } }
    : { ok: false, status: 401 }),
}));

vi.mock('@/lib/services/prospecting/exportBackup', () => ({
  buildProspectBackupCsv: state.backup,
}));

import { POST } from '@/app/api/admin/prospects/export-csv/route';

const prospectId = 'd6d3ea46-074a-4fdb-b502-fd2259ab6739';

function request(ids: unknown) {
  return new Request('https://app.test/api/admin/prospects/export-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

describe('admin prospect CSV export API', () => {
  beforeEach(() => {
    state.authorized = true;
    state.backup.mockReset();
    state.backup.mockResolvedValue({ csv: '\uFEFF"record_type"\r\n"prospect"', emailCount: 0 });
  });

  it('returns a downloadable UTF-8 BOM CSV', async () => {
    const response = await POST(request([prospectId]));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="prospects-backup-\d{4}-\d{2}-\d{2}-\d{6}\.csv"$/,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(state.backup).toHaveBeenCalledWith([prospectId]);
  });

  it('returns 400 for empty or invalid IDs without building a CSV', async () => {
    const emptyResponse = await POST(request([]));
    const invalidResponse = await POST(request(['not-a-uuid']));

    expect(emptyResponse.status).toBe(400);
    expect(invalidResponse.status).toBe(400);
    expect(state.backup).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-admin without building a CSV', async () => {
    state.authorized = false;
    const response = await POST(request([prospectId]));

    expect(response.status).toBe(401);
    expect(state.backup).not.toHaveBeenCalled();
  });

  it('returns an Arabic 500 when backup generation fails', async () => {
    state.backup.mockRejectedValue(new Error('query failed'));
    const response = await POST(request([prospectId]));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('تعذّر إنشاء النسخة الاحتياطية.');
  });
});
