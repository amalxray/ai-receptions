import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from '@/lib/booking/googleCalendarLink';

describe('buildGoogleCalendarUrl', () => {
  it('creates a Google Calendar event from the chat confirmation date format', () => {
    const url = buildGoogleCalendarUrl({
      appointmentDate: '2026-10-31 — 19:00',
      clinicName: 'مركز أمل',
      clinicPhone: '+962 6 555 1234',
      appointmentId: 'appointment-123',
      patientName: 'سارة أحمد',
      serviceName: 'تصوير بانوراما',
      timeZone: 'Asia/Amman',
    });

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('dates')).toBe('20261031T190000/20261031T193000');
    expect(parsed.searchParams.get('text')).toBe('تصوير بانوراما — مركز أمل');
    expect(parsed.searchParams.get('ctz')).toBe('Asia/Amman');
    expect(parsed.searchParams.get('details')).toContain('appointment-123');
    expect(parsed.searchParams.get('details')).toContain('سارة أحمد');
    expect(parsed.searchParams.get('details')).toContain('+962 6 555 1234');
  });

  it('returns null for incomplete or invalid appointment dates', () => {
    expect(buildGoogleCalendarUrl({
      appointmentDate: 'غير محدد',
      clinicName: 'مركز أمل',
      appointmentId: 'appointment-123',
      patientName: 'سارة أحمد',
      serviceName: 'تصوير بانوراما',
    })).toBeNull();

    expect(buildGoogleCalendarUrl({
      appointmentDate: '2026-02-30 — 19:00',
      clinicName: 'مركز أمل',
      appointmentId: 'appointment-123',
      patientName: 'سارة أحمد',
      serviceName: 'تصوير بانوراما',
    })).toBeNull();
  });
});
