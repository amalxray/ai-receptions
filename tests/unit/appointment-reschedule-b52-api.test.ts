import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B52 — reschedule ROUTE contract (companion of appointment-reschedule-b52.test.ts).
 *
 * The route previously guessed the HTTP status from substrings of the thrown
 * message, so a business rejection with an unlisted phrase reached the
 * receptionist as `500 Internal server error`. Codes now drive the response.
 * The real RescheduleError class + maps are kept and only the orchestration
 * function is stubbed (same pattern as booking-api.test.ts).
 */

const CLINIC = '11111111-1111-1111-1111-111111111111';
const APPOINTMENT = '55555555-5555-5555-5555-555555555555';

const svc = vi.hoisted(() => ({ rescheduleAppointment: vi.fn() }));
vi.mock('@/lib/services/appointmentReschedule', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/appointmentReschedule')>()),
  rescheduleAppointment: svc.rescheduleAppointment,
}));

const auth = vi.hoisted(() => ({ authorizeClinicRequest: vi.fn() }));
vi.mock('@/lib/services/clinicAuthorization', () => auth);

const logging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => logging);

import {
  RescheduleError,
  RESCHEDULE_HTTP_STATUS,
  RESCHEDULE_USER_MESSAGE,
  type RescheduleErrorCode,
} from '@/lib/services/appointmentReschedule';
import { POST as reschedulePOST } from '@/app/api/appointments/reschedule/route';

function rescheduleRequest(body: unknown) {
  return new Request(`http://localhost/api/appointments/reschedule?clinic_id=${CLINIC}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { appointment_id: APPOINTMENT, date: '2026-10-06', time: '09:00' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.authorizeClinicRequest.mockResolvedValue({ authorized: true, role: 'owner', user: { id: 'u1' } });
});

describe('B52 route — business failures never answer 500', () => {
  it('answers 409 + Arabic for an appointment without a provider (was 500)', async () => {
    svc.rescheduleAppointment.mockRejectedValue(
      new RescheduleError('no_provider', 'Appointment has no provider assigned — reschedule not possible'),
    );

    const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).not.toBe('Internal server error');
    expect(body.error).toContain('مقدّم خدمة');
    expect(body.error_code).toBe('no_provider');
  });

  it('answers 404 when the provider row is gone (was 500)', async () => {
    svc.rescheduleAppointment.mockRejectedValue(new RescheduleError('provider_not_found', 'Provider not found for this clinic'));
    const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error_code).toBe('provider_not_found');
  });

  it('answers 404 / 409 / 403 for the remaining business codes', async () => {
    const cases: Array<[RescheduleErrorCode, number]> = [
      ['not_found', 404],
      ['ineligible_status', 409],
      ['slot_unavailable', 409],
      ['conflict', 409],
      ['provider_not_assigned', 403],
    ];
    for (const [code, status] of cases) {
      svc.rescheduleAppointment.mockRejectedValue(new RescheduleError(code, `boom: ${code}`));
      const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
      expect(res.status).toBe(status);
      expect((await res.json()).error_code).toBe(code);
    }
  });

  it('keeps 500 only for a genuine write failure, with Arabic copy', async () => {
    svc.rescheduleAppointment.mockRejectedValue(new RescheduleError('update_failed', 'Failed to reschedule appointment'));
    const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('تعذر حفظ الموعد');
  });

  it('still answers a generic 500 for unexpected errors and logs them', async () => {
    svc.rescheduleAppointment.mockRejectedValue(new Error('socket hang up'));
    const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
    expect(logging.logEvent).toHaveBeenCalledWith(
      'appointment_reschedule_api_error',
      expect.objectContaining({ clinic_id: CLINIC }),
      'error',
    );
  });

  it('passes auth failures through untouched', async () => {
    auth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });
    const res = await reschedulePOST(rescheduleRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed payload with 400 before touching the service', async () => {
    const res = await reschedulePOST(rescheduleRequest({ appointment_id: 'not-a-uuid', date: '2026-10-06', time: '09:00' }));
    expect(res.status).toBe(400);
    expect(svc.rescheduleAppointment).not.toHaveBeenCalled();
  });

  it('B52-B: rejects a non-UUID provider_id with 400 (cannot bypass availability with junk)', async () => {
    const res = await reschedulePOST(rescheduleRequest({ ...VALID_BODY, provider_id: 'provider-1' }));
    expect(res.status).toBe(400);
    expect(svc.rescheduleAppointment).not.toHaveBeenCalled();
  });

  it('B52-B: forwards the picked provider to the service (edit panel path)', async () => {
    const providerId = '77777777-7777-7777-7777-777777777777';
    svc.rescheduleAppointment.mockResolvedValue({ id: APPOINTMENT, provider_id: providerId });

    const res = await reschedulePOST(rescheduleRequest({ ...VALID_BODY, provider_id: providerId }));

    expect(res.status).toBe(200);
    expect(svc.rescheduleAppointment).toHaveBeenCalledWith(expect.objectContaining({ providerId }));
  });

  it('B52-B: an omitted provider_id stays null so the appointment keeps its provider', async () => {
    svc.rescheduleAppointment.mockResolvedValue({ id: APPOINTMENT });
    await reschedulePOST(rescheduleRequest(VALID_BODY));
    expect(svc.rescheduleAppointment).toHaveBeenCalledWith(expect.objectContaining({ providerId: null }));
  });
});

describe('B52 contract guards', () => {
  const ALL_CODES: RescheduleErrorCode[] = [
    'not_found', 'ineligible_status', 'no_provider', 'provider_not_assigned',
    'provider_not_found', 'slot_unavailable', 'conflict', 'update_failed',
  ];

  it('every code has an HTTP status and Arabic actionable copy', () => {
    for (const code of ALL_CODES) {
      expect(RESCHEDULE_HTTP_STATUS[code]).toBeTypeOf('number');
      expect(RESCHEDULE_USER_MESSAGE[code]).toBeTruthy();
      expect(RESCHEDULE_USER_MESSAGE[code]).not.toMatch(/[A-Za-z]/);
    }
  });

  it('only a genuine write failure may be 5xx', () => {
    for (const code of ALL_CODES) {
      if (code === 'update_failed') continue;
      expect(RESCHEDULE_HTTP_STATUS[code]).toBeLessThan(500);
    }
  });

  it('the route resolves codes through the shared maps, not new string checks', async () => {
    const routeSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../app/api/appointments/reschedule/route.ts', import.meta.url), 'utf8'),
    );
    expect(routeSource).toContain('RESCHEDULE_HTTP_STATUS[err.code]');
    expect(routeSource).toContain('RESCHEDULE_USER_MESSAGE[err.code]');
  });
});
