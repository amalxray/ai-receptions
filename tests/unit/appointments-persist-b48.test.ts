import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * B48 — «الموعد يُسجَّل لكن لا يُحفظ».
 *
 * The owner created an appointment in ابو خليل فريتخ's file: the panel said
 * «تم حفظ الموعد», and the row WAS in the database — but it vanished on refresh.
 *
 * Root cause: `GET /api/appointments` answers `{ data: [...] }`, while the patient
 * file did `Array.isArray(body) ? body : []` → an empty list on every load. The
 * created row only lived in local state (`onCreated`), so nothing survived a
 * reload. This file pins the envelope contract, the new `patient_id` filter, and
 * the source wiring that made the bug invisible.
 */

const mockAuth = vi.hoisted(() => ({ authorizeClinicRequest: vi.fn() }));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockSupabase = vi.hoisted(() => {
  const q: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    limit: vi.fn(),
    delete: vi.fn(),
  };
  return { supabase: q };
});
vi.mock('@/lib/supabase', () => mockSupabase);
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockSupabase.supabase }));

const mockConfig = vi.hoisted(() => ({ getSupabaseEnvConfig: vi.fn() }));
vi.mock('@/lib/config', () => mockConfig);

const mockScheduling = vi.hoisted(() => ({ getCalendarRange: vi.fn() }));
vi.mock('@/lib/services/scheduling', () => mockScheduling);

const mockDemo = vi.hoisted(() => ({ createDemoAppointment: vi.fn(), getDemoAppointments: vi.fn() }));
vi.mock('@/lib/demoState', () => mockDemo);

import { GET as getAppointments, POST as postAppointment } from '@/app/api/appointments/route';

const CLINIC = '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5';
const OTHER_CLINIC = '22222222-2222-2222-2222-222222222222';
const PATIENT = '4d3a2679-9e01-4ea6-bf61-5d36c07d4c54';
const APPT = '3ed9352a-8c68-4dc4-bf70-80e14359ba7d';

function resetChain() {
  const q = mockSupabase.supabase;
  q.from.mockReturnValue(q);
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.gte.mockReturnValue(q);
  q.lt.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.delete.mockReturnValue(q);
  // Same shape as the real PostgREST builder: `insert(...).select('*').single()`.
  q.insert.mockReturnValue(q);
  q.single.mockResolvedValue({ data: null, error: null });
  q.in.mockResolvedValue({ data: [], error: null });
  q.limit.mockResolvedValue({ data: [], error: null });
}


describe('B48 — GET /api/appointments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
    mockConfig.getSupabaseEnvConfig.mockReturnValue({
      isConfigured: true,
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceRoleKey: 'test-service-role-key',
    });
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'user-1' }, role: 'owner' });
  });

  it('filters by patient_id when the patient file asks for one patient', async () => {
    const q = mockSupabase.supabase;
    q.limit.mockResolvedValue({
      data: [
        {
          id: APPT,
          clinic_id: CLINIC,
          patient_id: PATIENT,
          provider_id: null,
          service: 'تصوير طبقي  cbct',
          appointment_date: '2026-10-01',
          scheduled_at: '2026-10-01T10:30:00+00:00',
          status: 'pending',
        },
      ],
      error: null,
    });
    q.in.mockResolvedValue({ data: [{ id: PATIENT, full_name: 'ابو خليل فريتخ' }], error: null });

    const res = await getAppointments(
      new Request(`http://localhost/api/appointments?clinic_id=${CLINIC}&patient_id=${PATIENT}`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(q.eq).toHaveBeenCalledWith('clinic_id', CLINIC);
    expect(q.eq).toHaveBeenCalledWith('patient_id', PATIENT);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].patient_id).toBe(PATIENT);
    expect(body.data[0].appointment_time).toBe('10:30');
  });

  it('keeps the agenda working when no patient_id is sent', async () => {
    const q = mockSupabase.supabase;
    const res = await getAppointments(new Request(`http://localhost/api/appointments?clinic_id=${CLINIC}`));
    expect(res.status).toBe(200);
    expect(q.eq).not.toHaveBeenCalledWith('patient_id', expect.anything());
    expect(q.gte).not.toHaveBeenCalled();
  });

  it('always answers with the { data: [...] } envelope the dashboards read', async () => {
    const res = await getAppointments(new Request(`http://localhost/api/appointments?clinic_id=${CLINIC}`));
    const body = await res.json();
    // The bug: treating this object as a bare array silently produced an empty list.
    expect(Array.isArray(body)).toBe(false);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('never lets another clinic read the rows', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const res = await getAppointments(new Request(`http://localhost/api/appointments?clinic_id=${OTHER_CLINIC}`));
    expect(res.status).toBe(403);
  });

  it('still persists a created appointment (the POST half of B48 was healthy)', async () => {
    const q = mockSupabase.supabase;
    q.single.mockResolvedValue({
      data: {
        id: APPT,
        clinic_id: CLINIC,
        patient_id: PATIENT,
        provider_id: null,
        service: 'تصوير طبقي  cbct',
        appointment_date: '2026-10-01',
        scheduled_at: '2026-10-01T10:30:00.000Z',
        status: 'pending',
      },
      error: null,
    });
    q.in.mockResolvedValue({ data: [{ id: PATIENT, full_name: 'ابو خليل فريتخ' }], error: null });

    const res = await postAppointment(
      new Request('http://localhost/api/appointments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clinic_id: CLINIC,
          patient_id: PATIENT,
          service: 'تصوير طبقي  cbct',
          appointment_date: '2026-10-01',
          appointment_time: '10:30',
          status: 'pending',
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(q.insert).toHaveBeenCalled();
    expect(body.data.appointment_time).toBe('10:30');
  });
});

/* ------------------------------------------------------------------ */
/* Source guards — the wiring that let the bug hide                     */
/* ------------------------------------------------------------------ */

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

describe('B48 — wiring guards', () => {
  const patientFile = read('app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx');
  const patientsList = read('app/(dashboard)/dashboard/[clinicSlug]/patients/page.tsx');
  const agenda = read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
  const api = read('app/api/appointments/route.ts');

  it('the patient file unwraps the { data } envelope instead of expecting a bare array', () => {
    expect(patientFile).toContain('Array.isArray(payload?.data)');
    expect(patientFile).not.toContain('(await res.json()) as PatientAppointment[]');
  });

  it('the patient file asks the API for one patient only', () => {
    expect(patientFile).toContain('&patient_id=${encodeURIComponent(patientId)}');
  });

  it('the API supports the optional patient_id filter (POST/agenda untouched)', () => {
    expect(api).toContain("url.searchParams.get('patient_id')");
    expect(api).toContain("if (patientId) query = query.eq('patient_id', patientId)");
  });

  it('every other consumer keeps unwrapping ?.data, so no regression is introduced', () => {
    expect(patientsList).toContain('Array.isArray(body?.data)');
    expect(agenda).toContain('Array.isArray(appointmentPayload?.data)');
  });
});

