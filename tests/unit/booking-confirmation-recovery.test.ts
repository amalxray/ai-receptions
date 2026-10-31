import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_CONFIRMED_REPLY,
  isBookingConfirmedReply,
  recoverBookingConfirmation,
} from '@/lib/chat/bookingConfirmationRecovery';

afterEach(() => vi.unstubAllGlobals());

const receipt = {
  appointment_id: 'appointment-123',
  service: 'تصوير بانوراما',
  appointment_date: '2026-10-31 — 19:00',
  patient_name: 'سارة أحمد',
  clinic_name: 'مركز أمل',
  clinic_phone: '+962 6 555 1234',
};

describe('booking confirmation recovery', () => {
  it('recognizes only the server confirmation receipt reply', () => {
    expect(isBookingConfirmedReply(BOOKING_CONFIRMED_REPLY)).toBe(true);
    expect(isBookingConfirmedReply(` ${BOOKING_CONFIRMED_REPLY} `)).toBe(true);
    expect(isBookingConfirmedReply('تم استلام طلب الحجز')).toBe(false);
  });

  it('loads the saved receipt using the clinic slug and conversation id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ booking_confirmation_result: receipt }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(recoverBookingConfirmation('amal-x-ray-center', 'conversation/123')).resolves.toEqual(receipt);

    const [url, options] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(url, 'https://example.test');
    expect(parsedUrl.pathname).toBe('/api/public/ai/messages');
    expect(parsedUrl.searchParams.get('clinic_slug')).toBe('amal-x-ray-center');
    expect(parsedUrl.searchParams.get('conversation_id')).toBe('conversation/123');
    expect(options).toEqual({ cache: 'no-store' });
  });

  it('uses the clinic id query parameter for UUID clinic identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ booking_confirmation_result: receipt }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await recoverBookingConfirmation('11111111-1111-1111-1111-111111111111', 'conversation-123');

    const parsedUrl = new URL(fetchMock.mock.calls[0][0], 'https://example.test');
    expect(parsedUrl.searchParams.get('clinic_id')).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsedUrl.searchParams.has('clinic_slug')).toBe(false);
  });

  it('returns null when the history endpoint has no saved booking receipt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ booking_confirmation_result: null }), { status: 200 }),
    ));

    await expect(recoverBookingConfirmation('amal-x-ray-center', 'conversation-123')).resolves.toBeNull();
  });

  it('throws an explicit error when receipt recovery fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'failed' }), { status: 500 }),
    ));

    await expect(recoverBookingConfirmation('amal-x-ray-center', 'conversation-123'))
      .rejects.toThrow('Booking confirmation lookup failed (500)');
  });
});
