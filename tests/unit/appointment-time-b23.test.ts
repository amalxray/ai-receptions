import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * B23 — the appointment time is real again.
 *
 * Two layers are covered:
 *  1. the pure UI helpers (default slot, relative day label, upcoming/past split)
 *  2. the API contract: `POST /api/appointments` must persist the chosen time as
 *     `scheduled_at` (the column every reader displays) instead of dropping it
 *     and letting every appointment render as the hardcoded 09:00.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
  ADMIN_ROLES: ['owner', 'manager'],
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
}));
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
    limit: vi.fn(),
  };
  return { supabase: q };
});
vi.mock('@/lib/supabase', () => mockSupabase);
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockSupabase.supabase }));

const mockConfig = vi.hoisted(() => ({
  getSupabaseEnvConfig: vi.fn(() => ({
    isConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabaseServiceRoleKey: 'test-service-role-key',
  })),
}));
vi.mock('@/lib/config', () => mockConfig);

vi.mock('@/lib/services/scheduling', () => ({ getCalendarRange: vi.fn() }));
vi.mock('@/lib/demoState', () => ({ createDemoAppointment: vi.fn(), getDemoAppointments: vi.fn(() => []) }));

import { GET as getAppointments, POST as postAppointment } from '@/app/api/appointments/route';
import { defaultSlotFor, relativeDayLabelAr, splitAppointments } from '@/components/dashboard/patients/PatientAppointmentsPanel';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PATIENT = '33333333-3333-3333-3333-333333333333';

const q = mockSupabase.supabase;

function resetChain() {
  q.from.mockReturnValue(q);
  q.select.mockReturnValue(q);
  q.insert.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.single.mockResolvedValue({ data: null, error: null });
  q.in.mockResolvedValue({ data: [], error: null });
  q.limit.mockResolvedValue({ data: [], error: null });
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseCreate = {
  clinic_id: CLINIC,
  patient_id: PATIENT,
  service: 'تنظيف جير',
  appointment_date: '2026-09-29',
  duration_minutes: 30,
  provider_id: null,
  status: 'scheduled',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetChain();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, status: 200 });
});

describe('B23 — default slot', () => {
  it('rounds a fresh hour up to the next half hour', () => {
    expect(defaultSlotFor(new Date(2026, 8, 29, 14, 0))).toEqual({ date: '2026-09-29', time: '14:30' });
  });

  it('rounds a mid-half-hour time up, never down', () => {
    expect(defaultSlotFor(new Date(2026, 8, 29, 14, 7))).toEqual({ date: '2026-09-29', time: '14:30' });
  });

  it('moves on when the clock already sits on the half hour', () => {
    expect(defaultSlotFor(new Date(2026, 8, 29, 14, 30))).toEqual({ date: '2026-09-29', time: '15:00' });
  });

  it('rolls to tomorrow instead of producing an invalid 24:00', () => {
    expect(defaultSlotFor(new Date(2026, 8, 29, 23, 59))).toEqual({ date: '2026-09-30', time: '00:00' });
  });
});

describe('B23 — relative day labels', () => {
  it('labels today, tomorrow, yesterday and later days', () => {
    expect(relativeDayLabelAr('2026-09-29', '2026-09-29')).toBe('اليوم');
    expect(relativeDayLabelAr('2026-09-30', '2026-09-29')).toBe('غداً');
    expect(relativeDayLabelAr('2026-09-28', '2026-09-29')).toBe('أمس');
    expect(relativeDayLabelAr('2026-10-02', '2026-09-29')).toBe('بعد 3 أيام');
  });

  it('returns an empty label instead of throwing on junk input', () => {
    expect(relativeDayLabelAr('not-a-date', '2026-09-29')).toBe('');
  });
});

describe('B23 — upcoming / past split', () => {
  const rows: any[] = [
    { id: 'a', service: 'حشوة', appointment_date: '2026-10-05', appointment_time: '11:00', status: 'scheduled' },
    { id: 'b', service: 'تنظيف', appointment_date: '2026-09-29', appointment_time: '14:30', status: 'confirmed' },
    { id: 'c', service: 'قلع', appointment_date: '2026-09-10', appointment_time: '09:15', status: 'completed' },
    { id: 'd', service: 'استشارة', appointment_date: '2026-09-20', appointment_time: '10:00', status: 'cancelled' },
  ];

  it('sorts upcoming soonest-first and keeps closed rows out', () => {
    const { upcoming } = splitAppointments(rows, '2026-09-29');
    expect(upcoming.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('sorts the past newest-first', () => {
    const { past } = splitAppointments(rows, '2026-09-29');
    expect(past.map((row) => row.id)).toEqual(['d', 'c']);
  });
});

describe('B23 — POST /api/appointments persists the chosen time', () => {
  it('writes scheduled_at from appointment_time and echoes the same time back', async () => {
    q.single.mockResolvedValue({
      data: {
        id: 'appt-1',
        clinic_id: CLINIC,
        patient_id: PATIENT,
        service: 'تنظيف جير',
        appointment_date: '2026-09-29',
        scheduled_at: '2026-09-29T14:30:00.000Z',
        status: 'scheduled',
        provider_id: null,
      },
      error: null,
    });

    const res = await postAppointment(postRequest({ ...baseCreate, appointment_time: '14:30' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(q.insert).toHaveBeenCalledWith([expect.objectContaining({ scheduled_at: '2026-09-29T14:30:00.000Z' })]);
    expect(body.data.appointment_time).toBe('14:30');
  });

  it('keeps the old behaviour for callers that send no time (no scheduled_at key)', async () => {
    q.single.mockResolvedValue({
      data: {
        id: 'appt-2',
        clinic_id: CLINIC,
        patient_id: PATIENT,
        service: 'تنظيف',
        appointment_date: '2026-09-29',
        scheduled_at: null,
        status: 'scheduled',
      },
      error: null,
    });

    const res = await postAppointment(postRequest(baseCreate));
    const body = await res.json();
    const [payload] = q.insert.mock.calls[0];

    expect(res.status).toBe(201);
    expect(Object.prototype.hasOwnProperty.call(payload[0], 'scheduled_at')).toBe(false);
    expect(body.data.appointment_time).toBe('09:00');
  });

  it('rejects an impossible time instead of storing a broken row', async () => {
    const res = await postAppointment(postRequest({ ...baseCreate, appointment_time: '25:99' }));
    expect(res.status).toBe(400);
    expect(q.insert).not.toHaveBeenCalled();
  });

  it('maps an already-taken slot to 409 instead of 500', async () => {
    q.single.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    const res = await postAppointment(postRequest({ ...baseCreate, appointment_time: '14:30' }));
    expect(res.status).toBe(409);
  });
});

describe('B23 — GET derives the displayed time safely', () => {
  const clinicRow = (row: Record<string, unknown>) => {
    q.limit.mockResolvedValue({ data: [{ clinic_id: CLINIC, patient_id: PATIENT, provider_id: null, service: 'تنظيف', status: 'scheduled', ...row }], error: null });
    return getAppointments(new Request(`http://localhost/api/appointments?clinic_id=${CLINIC}`));
  };

  it('reads the wall-clock time out of scheduled_at', async () => {
    const res = await clinicRow({ id: 'a', appointment_date: '2026-09-29', scheduled_at: '2026-09-29T07:45:00.000Z' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].appointment_time).toBe('07:45');
  });

  it('never 500s on a malformed timestamp', async () => {
    const res = await clinicRow({ id: 'b', appointment_date: '2026-09-29', scheduled_at: 'not-a-date' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].appointment_time).toBe('09:00');
  });

  it('honours a legacy text column when scheduled_at is empty', async () => {
    const res = await clinicRow({ id: 'c', appointment_date: '2026-09-29', scheduled_at: null, appointment_time: '13:05' });
    const body = await res.json();
    expect(body.data[0].appointment_time).toBe('13:05');
  });
});

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

describe('B23 — wiring guards (the UI must never drop the time again)', () => {
  const agenda = read('app/(dashboard)/dashboard/[clinicSlug]/appointments/page.tsx');
  const patientPage = read('app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx');
  const panel = read('components/dashboard/patients/PatientAppointmentsPanel.tsx');
  const route = read('app/api/appointments/route.ts');

  it('the clinic agenda sends the picked time with the create request', () => {
    expect(agenda).toContain('appointment_time: formState.appointment_time,');
  });

  it('the API validates the time and stores it as scheduled_at', () => {
    expect(route).toContain('appointment_time: z.string().regex(TIME_PATTERN');
    expect(route).toContain('if (scheduledAt) insertPayload.scheduled_at = scheduledAt;');
  });

  it('the patient file offers ➕ إضافة موعد in both the tab and the overview', () => {
    expect(patientPage).toContain('variant="full"');
    expect(patientPage).toContain('variant="compact"');
    expect(panel).toContain('إضافة موعد');
    expect(panel).toContain('onCreated?.(row)');
  });

  it('the patient panel posts appointment_time, not just the date', () => {
    expect(panel).toContain('appointment_time: form.appointment_time,');
  });
});
