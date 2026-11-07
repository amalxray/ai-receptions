import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthorization = vi.hoisted(() => ({ authorizeClinicRequest: vi.fn() }));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuthorization);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockDatabase = vi.hoisted(() => {
  const query = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  return { query, supabaseAdmin: query };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockDatabase.supabaseAdmin }));

import { GET } from '@/app/api/clinic/patients/[patientId]/communications/route';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_ID = '22222222-2222-2222-2222-222222222222';

describe('Patient communications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { query } = mockDatabase;
    query.from.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: PATIENT_ID }, error: null });
    query.limit.mockResolvedValue({ data: [], error: null });
    mockAuthorization.authorizeClinicRequest.mockResolvedValue({ authorized: true, role: 'owner' });
  });

  it('uses the authorized clinic-scoped patient before returning communication history', async () => {
    const response = await GET(new Request(
      `https://example.com/api/clinic/patients/${PATIENT_ID}/communications?clinic_id=${CLINIC_ID}`,
    ));

    expect(response.status).toBe(200);
    expect(mockDatabase.query.from).toHaveBeenNthCalledWith(1, 'patients');
    expect(mockDatabase.query.from).toHaveBeenNthCalledWith(2, 'notification_queue');
    expect(mockDatabase.query.eq).toHaveBeenCalledWith('id', PATIENT_ID);
    expect(mockDatabase.query.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
    expect(mockDatabase.query.eq).toHaveBeenCalledWith('patient_id', PATIENT_ID);
    expect(mockDatabase.query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('returns a server error and logs a patient lookup failure', async () => {
    mockDatabase.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await GET(new Request(
      `https://example.com/api/clinic/patients/${PATIENT_ID}/communications?clinic_id=${CLINIC_ID}`,
    ));

    expect(response.status).toBe(500);
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'patient_communications_patient_lookup_error',
      expect.objectContaining({ clinic_id: CLINIC_ID, patient_id: PATIENT_ID }),
      'error',
    );
    expect(mockDatabase.query.from).toHaveBeenCalledTimes(1);
  });
});
