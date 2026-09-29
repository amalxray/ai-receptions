/**
 * B51-H + B51-D — from the incident, two hardening rules.
 *
 * B51-H (client): «Supabase is not configured» was reported for two completely
 * different failures — a NETWORK hiccup and a genuinely UNCONFIGURED deployment
 * — and it fired on the first paint because the async health-check starts at
 * `isConfigured: false`. The hook must wait for the verdict and then speak
 * Arabic, naming the real cause.
 *
 * B51-D (server): a deployment without Supabase env silently served IN-MEMORY
 * DEMO patients/appointments. Fake clinical data must never be served in
 * production: the fallback is dev/test-only and production fails loudly (503).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* -------------------------------------------------------------------------- */
/* Mocks: the routes must reach their demo/503 branch without a real backend   */
/* -------------------------------------------------------------------------- */

vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({ supabaseUrl: '', anonKey: '', serviceRoleKey: '', isConfigured: false }),
  isSupabaseConfigured: () => false,
}));

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: vi.fn(async () => ({ authorized: true, status: 200, role: 'owner', userId: 'u1' })),
  roleDenied: () => null,
  DATA_ROLES: ['owner'],
  ADMIN_ROLES: ['owner'],
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: () => {} }));

import {
  CLINIC_CTX_NETWORK_ERROR_AR,
  CLINIC_CTX_NOT_CONFIGURED_ERROR_AR,
  configErrorMessage,
} from '@/lib/useClinicContext';
import { demoFallbackAllowed } from '@/lib/demoState';
import { GET as patientsGET, POST as patientsPOST } from '@/app/api/patients/route';
import {
  DELETE as patientDELETE,
  GET as patientGET,
  PUT as patientPUT,
} from '@/app/api/patients/[patientId]/route';
import { GET as apptsGET, POST as apptsPOST } from '@/app/api/appointments/route';

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PATIENT = '64e9f7e6-ba03-4645-a478-6b64add15603';
const DEMO_CLINIC = '00000000-0000-0000-0000-000000000000';
const DEMO_PATIENT = '11111111-1111-1111-1111-111111111111';
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

/** Next types `process.env.NODE_ENV` as readonly — flip it through a cast. */
const mutableEnv = process.env as Record<string, string | undefined>;

/** `demoFallbackAllowed()` reads NODE_ENV at CALL time — so we can flip worlds. */
function asProduction() {
  mutableEnv.NODE_ENV = 'production';
}
function asDevelopment() {
  mutableEnv.NODE_ENV = 'development';
}

afterEach(() => {
  mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('B51-H — the two configuration failures speak Arabic and stay distinct', () => {
  it('names the network failure when the health-check itself failed', () => {
    expect(configErrorMessage(true)).toBe(CLINIC_CTX_NETWORK_ERROR_AR);
    expect(configErrorMessage(true)).not.toBe(CLINIC_CTX_NOT_CONFIGURED_ERROR_AR);
  });

  it('names the deployment failure when the deployment really is unconfigured', () => {
    expect(configErrorMessage(false)).toBe(CLINIC_CTX_NOT_CONFIGURED_ERROR_AR);
  });

  it('is Arabic and actionable — never the old English dead end', () => {
    const arabic = /[\u0600-\u06FF]/;
    for (const message of [CLINIC_CTX_NETWORK_ERROR_AR, CLINIC_CTX_NOT_CONFIGURED_ERROR_AR]) {
      expect(message).toMatch(arabic);
      expect(message).not.toMatch(/Supabase is not configured/i);
    }
    // The network case must tell the user to retry; the env case must not.
    expect(CLINIC_CTX_NETWORK_ERROR_AR).toMatch(/أعد المحاولة/);
    expect(CLINIC_CTX_NOT_CONFIGURED_ERROR_AR).not.toMatch(/أعد المحاولة/);
  });

  it('waits for the async verdict instead of flashing an error on first paint', () => {
    const src = read('lib/useClinicContext.ts');
    // The gate must come BEFORE the error branch.
    const gate = src.indexOf('if (isConfigLoading) return;');
    const errBranch = src.indexOf('if (!isConfigured) {');
    expect(gate).toBeGreaterThan(-1);
    expect(errBranch).toBeGreaterThan(gate);
    // And the network/env distinction must reach the UI.
    expect(src).toContain('configErrorMessage(checkFailed)');
    expect(src).toContain('loading: isConfigLoading, checkFailed');
    // Re-resolve when any of the three inputs changes.
    expect(src).toContain('}, [isConfigured, isConfigLoading, checkFailed]);');
    // The misleading English string is gone for good.
    expect(src).not.toContain("'Supabase is not configured'");
  });
});


describe('B51-D — production must never answer with in-memory demo data', () => {
  it('keeps the fallback dev/test-only (the single switch)', () => {
    asProduction();
    expect(demoFallbackAllowed()).toBe(false);
    asDevelopment();
    expect(demoFallbackAllowed()).toBe(true);
  });

  it('GET /api/patients → 503 NOT_CONFIGURED in production, demo rows outside it', async () => {
    asProduction();
    const prod = await patientsGET(new Request(`https://app.test/api/patients?clinic_id=${CLINIC}`));
    expect(prod.status).toBe(503);
    const prodBody = await prod.json();
    expect(prodBody.code).toBe('NOT_CONFIGURED');
    expect(Array.isArray(prodBody)).toBe(false);

    asDevelopment();
    const dev = await patientsGET(new Request(`https://app.test/api/patients?clinic_id=${CLINIC}`));
    expect(dev.status).toBe(200);
    const devBody = await dev.json();
    expect(Array.isArray(devBody)).toBe(true);
    expect(devBody.length).toBeGreaterThan(0);
  });

  it('POST /api/patients → no silent demo WRITE in production', async () => {
    const body = JSON.stringify({ clinic_id: DEMO_CLINIC, name: 'مريض اختبار B51-D' });

    asProduction();
    const prod = await patientsPOST(new Request('https://app.test/api/patients', { method: 'POST', body }));
    expect(prod.status).toBe(503);

    asDevelopment();
    const dev = await patientsPOST(new Request('https://app.test/api/patients', { method: 'POST', body }));
    expect(dev.status).toBe(201);
    expect((await dev.json()).name).toBe('مريض اختبار B51-D');
  });

  it('GET /api/patients/{id} → 503 in production, the demo row in dev', async () => {
    const url = `https://app.test/api/patients/${DEMO_PATIENT}?clinic_id=${DEMO_CLINIC}`;

    asProduction();
    expect((await patientGET(new Request(url))).status).toBe(503);

    asDevelopment();
    const dev = await patientGET(new Request(url));
    expect(dev.status).toBe(200);
    expect((await dev.json()).id).toBe(DEMO_PATIENT);
  });

  it('PUT and DELETE /api/patients/{id} → 503 too (no demo mutation in production)', async () => {
    const url = `https://app.test/api/patients/${DEMO_PATIENT}?clinic_id=${DEMO_CLINIC}`;

    asProduction();
    const put = await patientPUT(new Request(url, { method: 'PUT', body: '{}' }));
    expect(put.status).toBe(503);
    const del = await patientDELETE(new Request(url, { method: 'DELETE' }));
    expect(del.status).toBe(503);
    expect((await del.json()).code).toBe('NOT_CONFIGURED');
  });

  it('GET and POST /api/appointments → 503 in production (agenda is clinical data)', async () => {
    asProduction();
    const get = await apptsGET(new Request(`https://app.test/api/appointments?clinic_id=${CLINIC}`));
    expect(get.status).toBe(503);

    const post = await apptsPOST(
      new Request('https://app.test/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clinic_id: CLINIC,
          service: 'تصوير بانوراما',
          appointment_date: '2026-10-01',
          appointment_time: '10:00',
          duration_minutes: 30,
          status: 'scheduled',
        }),
      })
    );
    expect(post.status).toBe(503);
    expect((await post.json()).code).toBe('NOT_CONFIGURED');
  });
});

/* -------------------------------------------------------------------------- */
/* Invariant: no API route may reach demo state without the gate              */
/* -------------------------------------------------------------------------- */

describe('B51-D — the guard cannot be bypassed (source invariant)', () => {
  const apiDir = path.join(projectRoot, 'app/api');

  const apiFiles = (function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (entry.name.endsWith('.ts')) acc.push(full);
    }
    return acc;
  })(apiDir);

  const rel = (f: string) => path.relative(projectRoot, f).split(path.sep).join('/');
  const DEMO_ACCESSOR =
    /\b(getDemo[A-Za-z]*|createDemo[A-Za-z]*|appendDemo[A-Za-z]*|updateDemo[A-Za-z]*|deleteDemo[A-Za-z]*)\(|\bdemoLeads\b/;

  /**
   * B51-D2 closed the last demo leak in the leads route. The residual list must
   * stay empty; if a new unguarded demo accessor appears, this test fails.
   */
  const KNOWN_UNGUARDED_RESIDUAL: string[] = [];

  it('lists exactly the expected residual demo leak (must shrink, never grow)', () => {
    const offenders = apiFiles
      .filter((f) => DEMO_ACCESSOR.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !fs.readFileSync(f, 'utf8').includes('demoFallbackAllowed'))
      .map(rel)
      .sort();
    expect(offenders).toEqual([...KNOWN_UNGUARDED_RESIDUAL].sort());
  });

  it('every importer of a demo accessor also imports the gate', () => {
    const importers = apiFiles.filter((f) =>
      /from '@\/lib\/demoState'/.test(fs.readFileSync(f, 'utf8'))
    );
    expect(importers.length).toBeGreaterThanOrEqual(5);
    for (const file of importers) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src, `${rel(file)} uses demoState`).toContain('demoFallbackAllowed');
    }
  });
});


/* -------------------------------------------------------------------------- */
/* B51-H2 — a page may not LATCH the clinic-context error                     */
/* -------------------------------------------------------------------------- */

describe('B51-H2 — no page may cache/latch the clinic-context error', () => {
  const dashboardDir = path.join(projectRoot, 'app/(dashboard)');
  const relPath = (f: string) => path.relative(projectRoot, f).split(path.sep).join('/');
  /** `if (clinicError) setError(clinicError…)` fires once and is never cleared. */
  const STICKY = /if \(clinicError\) setError\(clinicError/;

  const pageFiles = (function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (entry.name === 'page.tsx') acc.push(full);
    }
    return acc;
  })(dashboardDir);

  /**
   * The reported page is fixed and the remaining latched pages were removed in
   * B51-H3. The list must shrink to zero; if a new latch reappears, this test
   * fails immediately.
   */
  const KNOWN_STICKY_RESIDUAL: string[] = [];

  it('the reported page shows the error LIVE instead of latching it', () => {
    const src = read('app/(dashboard)/dashboard/[clinicSlug]/patients/page.tsx');
    expect(src).not.toMatch(STICKY);
    expect(src).toContain('{formError ?? clinicError ?? error}');
    expect(src).toContain('description={clinicError ?? error}');
    // …and it still waits for the async verdict before searching.
    expect(src).toContain('if (clinicLoading) {');
  });

  it('the latched-clinic-error list must be empty after the live-render fix', () => {
    const offenders = pageFiles.filter((f) => STICKY.test(read(relPath(f)))).map(relPath).sort();
    expect(offenders).toEqual([...KNOWN_STICKY_RESIDUAL].sort());
  });
});

