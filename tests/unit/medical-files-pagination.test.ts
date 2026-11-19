import { describe, expect, it } from 'vitest';
import {
  buildMedicalFilesPage,
  parseMedicalFilesPage,
} from '@/lib/services/medicalFiles';

const FILE_ID = '33333333-3333-4333-8333-333333333333';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

describe('medical file keyset pagination', () => {
  it('uses the bounded default page size and rejects oversized requests', () => {
    expect(parseMedicalFilesPage(new URL('https://app.test/files'))).toEqual({ limit: 200, cursor: null });
    expect(parseMedicalFilesPage(new URL('https://app.test/files?limit=201'))).toBeNull();
  });

  it('requires a valid timestamp and UUID together for a continuation cursor', () => {
    expect(parseMedicalFilesPage(new URL(`https://app.test/files?cursor_created_at=${CREATED_AT}`))).toBeNull();
    expect(parseMedicalFilesPage(new URL('https://app.test/files?cursor_created_at=bad&cursor_id=not-a-uuid'))).toBeNull();
    expect(parseMedicalFilesPage(new URL(
      `https://app.test/files?cursor_created_at=${encodeURIComponent(CREATED_AT)}&cursor_id=${FILE_ID}`,
    ))).toEqual({ limit: 200, cursor: { created_at: CREATED_AT, id: FILE_ID } });
  });

  it('returns a next cursor only when a further page exists', () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));

    expect(buildMedicalFilesPage(rows.slice(0, 2), 2)).toMatchObject({
      data: rows.slice(0, 2),
      has_more: false,
      next_cursor: null,
    });
    expect(buildMedicalFilesPage(rows, 2)).toMatchObject({
      data: rows.slice(0, 2),
      has_more: true,
      next_cursor: { created_at: rows[1].created_at, id: rows[1].id },
    });
  });
});
