/**
 * B50 — invoice issuance from an ACTIVITY-AWARE catalog.
 *
 * THE INCIDENT (Amal X-Ray Center, patient عمر صقر, 30₪):
 *   insert or update on table "invoice_items" violates foreign key constraint
 *   "invoice_items_clinic_id_service_id_fkey"
 *
 * ROOT CAUSE: the patient file's invoice composer fills its dropdown from
 * `GET /api/clinic/services` = `listCatalogServices()`, which for an imaging
 * centre reads `imaging_services`. Those DOMAIN ids were posted straight into
 * `issue_invoice`, whose rows are FK-bound to the CANONICAL `clinic_services`,
 * so the constraint rejected the whole invoice — and the raw Postgres text was
 * printed to the owner.
 *
 * The fixtures below are the REAL rows captured from that clinic (read-only
 * probe), so the test reproduces the exact incident rather than a look-alike.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const logged: { event: string; payload?: Record<string, unknown> }[] = [];
vi.mock('@/lib/server/logging', () => ({
  logEvent: (event: string, payload?: Record<string, unknown>) => {
    logged.push({ event, payload });
  },
}));

/* ------------------------------------------------------------------ */
/* In-memory catalogs shaped exactly like the incident                 */
/* ------------------------------------------------------------------ */

/** `clinics.activity_type = imaging_center` → the UI lists these ids. */
const IMAGING = {
  panorama: '30a46d1e-e2dd-423e-83b7-9e89b3dd03c6', // تصوير بانوراما · 30
  cbct: 'c3bf43e3-e1cb-48ea-a34c-a5ed6b875c4b', // تصوير طبقي  cbct
  joint: '7e5c8d47-a0db-45aa-97c2-a7d5876d93ca', // مفصل الفكين · 80
};
/** The by-name mirrors the FK actually accepts. */
const CANONICAL = {
  panorama: '3f06ac6a-af3e-4f53-8082-504a6f056cd3', // تصوير بانوراما · 30 (active)
  cbct: '5716db7e-ef67-44d1-9cac-6fc84740900a', // تصوير طبقي  cbct
  joint: '404dfa98-85bf-4495-8a09-9d83763cf3d8', // مفصل الفكين · 80
  legacy: '367f1627-bf73-4f04-ba26-e10ad222499c', // تصوير بانوراما كامل للفكين
};

const state = {
  canonical: [] as { id: string; name: string }[],
  imaging: [] as { id: string; name: string }[],
  lab: [] as { id: string; name: string }[],
  queriedTables: [] as string[],
};

function rowsFor(table: string): { id: string; name: string }[] {
  if (table === 'clinic_services') return state.canonical;
  if (table === 'imaging_services') return state.imaging;
  if (table === 'lab_services') return state.lab;
  return [];
}

type Query = {
  select: () => Query;
  eq: (col: string, value: string) => Query;
  in: (col: string, values: string[]) => Query;
  then: (resolve: (value: { data: unknown; error: null }) => unknown) => unknown;
};

function builder(table: string): Query {
  state.queriedTables.push(table);
  const ids: string[] = [];
  const query: Query = {
    select: () => query,
    eq: () => query,
    in: (_col, values) => {
      ids.push(...values);
      return query;
    },
    then: (resolve) => {
      const rows = ids.length > 0 ? rowsFor(table).filter((r) => ids.includes(r.id)) : rowsFor(table);
      return resolve({ data: rows, error: null });
    },
  };
  return query;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import { resolveCanonicalServiceIds } from '@/lib/services/clinicServiceCatalog';
import { friendlyInvoiceError } from '@/lib/services/accounting';

const CLINIC = '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5';

beforeEach(() => {
  logged.length = 0;
  state.queriedTables.length = 0;
  state.canonical = [
    { id: CANONICAL.legacy, name: 'تصوير بانوراما كامل للفكين' },
    { id: CANONICAL.panorama, name: 'تصوير بانوراما' },
    { id: CANONICAL.cbct, name: 'تصوير طبقي  cbct' },
    { id: CANONICAL.joint, name: 'مفصل الفكين' },
  ];
  state.imaging = [
    { id: IMAGING.panorama, name: 'تصوير بانوراما' },
    { id: IMAGING.cbct, name: 'تصوير طبقي  cbct' },
    { id: IMAGING.joint, name: 'مفصل الفكين' },
  ];
  state.lab = [];
});


/* ------------------------------------------------------------------ */
/* The resolution itself                                               */
/* ------------------------------------------------------------------ */

describe('B50 — resolveCanonicalServiceIds', () => {
  it('maps the exact imaging id that broke the invoice onto its mirror', async () => {
    const map = await resolveCanonicalServiceIds(CLINIC, [IMAGING.panorama]);
    const hit = map.get(IMAGING.panorama);
    expect(hit?.outcome).toBe('mirrored');
    // The FK accepts THIS id — the incident's «بانوراما 30₪» line.
    expect(hit?.canonical).toBe(CANONICAL.panorama);
    expect(logged.map((l) => l.event)).toContain('invoice_service_id_mirrored');
  });

  it('resolves every domain service of the centre (not just the failing one)', async () => {
    const map = await resolveCanonicalServiceIds(CLINIC, [IMAGING.panorama, IMAGING.cbct, IMAGING.joint]);
    expect(map.get(IMAGING.cbct)?.canonical).toBe(CANONICAL.cbct);
    expect(map.get(IMAGING.joint)?.canonical).toBe(CANONICAL.joint);
    expect(Array.from(map.values()).every((r) => r.outcome === 'mirrored')).toBe(true);
  });

  it('passes a canonical (clinic) id through untouched — clinics are unaffected', async () => {
    const map = await resolveCanonicalServiceIds(CLINIC, [CANONICAL.panorama]);
    expect(map.get(CANONICAL.panorama)).toEqual({
      requested: CANONICAL.panorama,
      canonical: CANONICAL.panorama,
      outcome: 'canonical',
    });
    // A canonical id must not trigger the domain lookups at all.
    expect(state.queriedTables).not.toContain('imaging_services');
    expect(logged.length).toBe(0);
  });

  it('mirrors a domain id even when whitespace differs (trimmed match)', async () => {
    state.canonical = [{ id: CANONICAL.cbct, name: 'تصوير طبقي cbct' }]; // single space
    const map = await resolveCanonicalServiceIds(CLINIC, [IMAGING.cbct]); // double space
    expect(map.get(IMAGING.cbct)?.canonical).toBe(CANONICAL.cbct);
  });

  it('drops an unknown service id instead of failing the invoice', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999';
    const map = await resolveCanonicalServiceIds(CLINIC, [ghost]);
    expect(map.get(ghost)?.canonical).toBeNull();
    expect(map.get(ghost)?.outcome).toBe('dropped');
    // Logged loudly so the catalog can be fixed, but never thrown.
    expect(logged.map((l) => l.event)).toContain('invoice_service_id_dropped');
  });

  it('never sends a non-UUID id to a uuid column (that used to 500 the request)', async () => {
    const map = await resolveCanonicalServiceIds(CLINIC, ['not-a-uuid', '']);
    expect(map.get('not-a-uuid')?.canonical).toBeNull();
    expect(map.has('')).toBe(false);
    expect(state.queriedTables.length).toBe(0); // no query issued at all
  });

  it('is a no-op for free-text lines (service_id null) — the legacy invoices', async () => {
    const map = await resolveCanonicalServiceIds(CLINIC, [null, undefined]);
    expect(map.size).toBe(0);
    expect(state.queriedTables.length).toBe(0);
  });

  it('resolves a dental-lab id through lab_services as well', async () => {
    const labId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    state.lab = [{ id: labId, name: 'تصوير بانوراما' }];
    const map = await resolveCanonicalServiceIds(CLINIC, [labId]);
    expect(map.get(labId)?.canonical).toBe(CANONICAL.panorama);
    expect(state.queriedTables).toContain('lab_services');
  });

  it('handles a mixed batch (canonical + domain + ghost) in one pass', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999';
    const map = await resolveCanonicalServiceIds(CLINIC, [CANONICAL.joint, IMAGING.panorama, ghost]);
    expect(map.get(CANONICAL.joint)?.outcome).toBe('canonical');
    expect(map.get(IMAGING.panorama)?.outcome).toBe('mirrored');
    expect(map.get(ghost)?.outcome).toBe('dropped');
  });
});

/* ------------------------------------------------------------------ */
/* The raw Postgres text must never reach the owner                    */
/* ------------------------------------------------------------------ */

describe('B50 — friendlyInvoiceError', () => {
  const INCIDENT =
    'insert or update on table "invoice_items" violates foreign key constraint "invoice_items_clinic_id_service_id_fkey"';

  it('turns the exact incident message into a stable code', () => {
    expect(friendlyInvoiceError(INCIDENT)).toBe('SERVICE_NOT_IN_CATALOG');
  });

  it('hides any other constraint / SQL text behind a generic code', () => {
    expect(friendlyInvoiceError('duplicate key value violates unique constraint "x"')).toBe('INVOICE_SAVE_FAILED');
    expect(friendlyInvoiceError('column "foo" does not exist')).toBe('INVOICE_SAVE_FAILED');
  });

  it('keeps the actionable validation codes intact', () => {
    expect(friendlyInvoiceError('INVOICE_ITEMS_REQUIRED')).toBe('INVOICE_ITEMS_REQUIRED');
    expect(friendlyInvoiceError('ITEM_PRICE_INVALID')).toBe('ITEM_PRICE_INVALID');
    expect(friendlyInvoiceError('DISCOUNT_INVALID')).toBe('DISCOUNT_INVALID');
  });
});

/* ------------------------------------------------------------------ */
/* Wiring guards — the fix must be ON the path, not just available     */
/* ------------------------------------------------------------------ */

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

describe('B50 — wiring guards', () => {
  const accounting = read('lib/services/accounting.ts');
  const catalog = read('lib/services/clinicServiceCatalog.ts');
  const route = read('app/api/clinic/accounting/invoices/route.ts');
  const panel = read('components/dashboard/patients/PatientFinancialFilesPanel.tsx');

  it('issueInvoice resolves canonical ids BEFORE the RPC', () => {
    const resolveAt = accounting.indexOf('resolveCanonicalServiceIds(');
    const rpcAt = accounting.indexOf("rpc('issue_invoice'");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(rpcAt);
    expect(accounting).toContain('friendlyInvoiceError(error.message)');
  });

  it('the resolver mirrors by name — the same rule the catalog mirror uses', () => {
    expect(catalog).toContain('export async function resolveCanonicalServiceIds');
    expect(catalog).toContain(".from(table)\n          .select('id, name')");
    expect(catalog).toContain("from('clinic_services')");
  });

  it('the API answers catalog mismatches in Arabic with a 400 (never the constraint text)', () => {
    expect(route).toContain('SERVICE_NOT_IN_CATALOG');
    expect(route).toContain('INVOICE_ERROR_AR[message]');
    expect(route).toContain('status: 400');
  });

  it('the patient panel is the last line of defence against raw SQL', () => {
    expect(panel).toContain('function humanizePanelError');
    expect(panel).toContain('humanizePanelError(err instanceof Error');
    // The invoice catch must route through it, not print err.message directly.
    expect(panel).not.toMatch(/setActionError\(err instanceof Error \? err\.message/);
  });
});
