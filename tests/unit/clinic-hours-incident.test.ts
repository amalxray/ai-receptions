import { describe, expect, it } from 'vitest';
import { isOpenNow, nextOpening, zonedParts, type ClinicHours } from '@/lib/services/clinicHours';

/**
 * THE LIVE INCIDENT (regression guard):
 * User saw "مغلق الآن · يفتح اليوم الساعة 09:00" on Thursday 2026-09-17 while
 * the wall clock in Palestine was 11:45 and the clinic opens 09:00–20:00.
 * The old code compared the SERVER clock (UTC) — 08:45 — against the windows.
 * These tests pin the exact incident instant so the clinic-local evaluation
 * can never silently regress to server-time again.
 */
const INCIDENT = new Date('2026-09-17T08:45:00.000Z'); // 11:45 in Asia/Hebron (IDT, UTC+3)

const incidentClinic: ClinicHours = {
  clinicId: 'incident-clinic',
  slug: 'incident-clinic',
  timezone: 'Asia/Hebron',
  hasHours: true,
  days: [
    {
      weekday: 4, // Thursday
      periods: [{ start: '09:00', end: '20:00' }],
      start: '09:00',
      end: '20:00',
      breaks: [],
    },
  ],
};

describe('hours-status incident scenario — Thursday 2026-09-17, 11:45 clinic-local', () => {
  it('decodes 08:45Z as 11:45 Thursday in Asia/Hebron (not server UTC)', () => {
    const parts = zonedParts(INCIDENT, 'Asia/Hebron');
    expect(parts.time).toBe('11:45');
    expect(parts.weekday).toBe(4); // Thursday — the day with 09:00–20:00
  });

  it('reports OPEN at the incident instant even though the server clock says 08:45', async () => {
    const status = await isOpenNow(incidentClinic, INCIDENT);
    expect(status.isOpen).toBe(true);
    expect(status.currentTime).toBe('11:45');
    expect(status.todaySchedule).toEqual({ start: '09:00', end: '20:00' });
  });

  it('after 20:00 local the same day flips to CLOSED with a next opening', async () => {
    // 18:05Z == 21:05 local → closed; next opening is the following Thursday 09:00.
    const status = await isOpenNow(incidentClinic, new Date('2026-09-17T18:05:00.000Z'));
    expect(status.isOpen).toBe(false);
    expect(status.currentTime).toBe('21:05');
    const opening = await nextOpening(incidentClinic, new Date('2026-09-17T18:05:00.000Z'));
    expect(opening).toEqual({ weekday: 4, day: 'الخميس', time: '09:00', inDays: 7 });
  });
});
