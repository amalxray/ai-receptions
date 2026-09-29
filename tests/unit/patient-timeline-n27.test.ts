import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSessionTimelineItems,
  buildSmartTimeline,
  dedupeTimelineItems,
  parsePatientMetadata,
  parsePatientSessions,
  sessionTimelineStatus,
  sortTimelineDesc,
  type PatientSession,
  type SmartTimelineItem,
} from '@/components/dashboard/patients/smartProfile';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SmartPatientProfile from '@/components/dashboard/patients/SmartPatientProfile';

/**
 * N27 — ربط الجلسات بالخط الزمني.
 *
 * N26 stored the dental plan in `patients.metadata.sessions` and drew it in the
 * 🦷 tab, but the journey line still only showed appointments + notes. N27 turns
 * every session into a timeline event (🦷, coloured by procedure, with its
 * done / planned / cancelled state) and guarantees it is drawn exactly once.
 */

const session = (over: Partial<PatientSession> = {}): PatientSession => ({
  id: '2026-09-01|حشوة',
  date: '2026-09-01',
  service: 'حشوة',
  status: 'done',
  ...over,
});

const timelineItem = (over: Partial<SmartTimelineItem> = {}): SmartTimelineItem => ({
  id: 'session-1',
  title: 'حشوة',
  date: '2026-09-01',
  status: 'completed',
  iconType: 'session',
  ...over,
});

describe('N27 — buildSessionTimelineItems', () => {
  it('turns every session into exactly one timeline event', () => {
    const items = buildSessionTimelineItems([
      session({ id: 's1', service: 'حشوة', date: '2026-09-01' }),
      session({ id: 's2', service: 'خلع', date: '2026-09-08', status: 'planned' }),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.id)).toEqual(['session-s1', 'session-s2']);
    expect(items.map((item) => item.iconType)).toEqual(['session', 'session']);
    // The procedure rides along so the renderer can colour the node.
    expect(items[1].procedure).toBe('خلع');
    expect(items[1].sessionStatus).toBe('planned');
    expect(items[1].status).toBe('remaining');
  });

  it('maps done / planned / cancelled onto the timeline states', () => {
    expect(sessionTimelineStatus('done')).toBe('completed');
    expect(sessionTimelineStatus('planned')).toBe('remaining');
    expect(sessionTimelineStatus('cancelled')).toBe('cancelled');
    // Arabic labels doctors actually type go through the same normalizer.
    expect(sessionTimelineStatus('منجزة')).toBe('completed');
    expect(sessionTimelineStatus('ملغاة')).toBe('cancelled');
    expect(sessionTimelineStatus(undefined)).toBe('remaining');
  });

  it('describes the session with the tooth and the note', () => {
    const [full] = buildSessionTimelineItems([session({ tooth: '36', note: 'بنج موضعي' })]);
    expect(full.subtitle).toBe('السن 36 · بنج موضعي');

    const [toothOnly] = buildSessionTimelineItems([session({ tooth: 'الفك الأيسر' })]);
    expect(toothOnly.subtitle).toBe('السن الفك الأيسر');

    const [bare] = buildSessionTimelineItems([session()]);
    expect(bare.subtitle).toBeUndefined();
  });

  it('never throws on junk and keeps a date-less session', () => {
    expect(buildSessionTimelineItems(null)).toEqual([]);
    expect(buildSessionTimelineItems(undefined)).toEqual([]);
    expect(buildSessionTimelineItems('حشوة' as unknown as PatientSession[])).toEqual([]);

    const [noDate] = buildSessionTimelineItems([session({ id: 'x', date: '' })]);
    expect(noDate.date).toBe('');
    expect(noDate.id).toBe('session-x');
  });

  it('reads the plan straight out of metadata (the real profile path)', () => {
    const metadata = parsePatientMetadata({
      sessions: [{ date: '2026-09-01', service: 'علاج عصب', status: 'مكتملة' }],
    });
    const items = buildSessionTimelineItems(metadata.sessions);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('علاج عصب');
    expect(items[0].status).toBe('completed');
  });
});

describe('N27 — no duplicate sessions on the journey line', () => {
  it('keeps one event per id (sessions are passed first, so they win)', () => {
    const deduped = dedupeTimelineItems([
      timelineItem({ id: 'session-1', procedure: 'حشوة' }),
      timelineItem({ id: 'visit-9', title: 'موعد' }),
      timelineItem({ id: 'session-1', title: 'نسخة أضعف' }),
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].procedure).toBe('حشوة');
  });

  it('draws a duplicated plan entry exactly once', () => {
    const duplicated = [session({ id: 'same' }), session({ id: 'same' })];
    const timeline = buildSmartTimeline({ appointments: [], quickNotes: [], sessions: duplicated });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe('session-same');
  });

  it('never re-orders or drops the pre-existing appointment / note events', () => {
    const timeline = buildSmartTimeline({
      appointments: [
        {
          id: 'a1',
          service: 'فحص دوري',
          appointment_date: '2026-09-10',
          appointment_time: '09:00',
          status: 'confirmed',
        },
      ],
      quickNotes: [{ text: 'ملاحظة طبية', date: '2026-09-03T10:00:00Z', by: 'د. خالد' }],
      sessions: [session({ id: 's1', date: '2026-09-05', service: 'حشوة' })],
    });

    // Newest first: الموعد 09-10 → الجلسة 09-05 → الملاحظة 09-03
    expect(timeline.map((item) => item.iconType)).toEqual(['visit', 'session', 'note']);
    expect(timeline).toHaveLength(3);
  });

  it('stays backwards compatible when no plan is passed', () => {
    const timeline = buildSmartTimeline({
      appointments: [
        {
          id: 'a1',
          service: 'فحص دوري',
          appointment_date: '2026-01-10',
          appointment_time: '10:00',
          status: 'completed',
        },
      ],
      quickNotes: [{ text: 'تم فحص الأشعة', date: '2026-02-15T09:00:00Z' }],
    });
    expect(timeline).toHaveLength(2);
    expect(timeline[0].iconType).toBe('note');
  });
});

describe('N27 — chronological order', () => {
  it('sorts newest first and breaks ties with the clock', () => {
    const sorted = sortTimelineDesc([
      timelineItem({ id: 'b', date: '2026-09-01' }),
      timelineItem({ id: 'c', date: '2026-09-01', time: '11:00' }),
      timelineItem({ id: 'a', date: '2026-09-08' }),
      timelineItem({ id: 'd', date: '2026-09-01', time: '09:30' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('parses and sorts a real metadata plan through the same pipeline', () => {
    const sessions = parsePatientSessions([
      { date: '2026-09-01', service: 'حشوة', status: 'done' },
      { date: '2026-11-02', service: 'تلبيس', status: 'planned' },
    ]);
    const items = sortTimelineDesc(buildSessionTimelineItems(sessions));
    expect(items.map((item) => item.title)).toEqual(['تلبيس', 'حشوة']);
    expect(items[0].procedure).toBe('تلبيس');
  });
});


/* ------------------------------------------------------------------ */
/* SSR — the HTML a server request actually ships                       */
/* ------------------------------------------------------------------ */

const renderProfile = (metadata: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(SmartPatientProfile, {
      patient: { id: 'p1', name: 'سالم النوري', phone: '0599123456', metadata },
      stats: { visitsCount: 1, filesCount: 0, referralsCount: 0, invoicesCount: 0 },
      appointments: [
        {
          id: 'a1',
          service: 'فحص دوري',
          appointment_date: '2026-09-20',
          appointment_time: '09:00',
          status: 'confirmed',
          provider_name: 'خالد',
        },
      ],
    })
  );

const ssrHtml = renderProfile({
  quick_notes: [{ text: 'تم فحص الأشعة', date: '2026-09-02T10:00:00.000Z' }],
  sessions: [
    { id: 's1', date: '2026-09-01', service: 'حشوة', tooth: '36', status: 'done' },
    { id: 's2', date: '2026-09-08', service: 'تلبيس زركون', status: 'planned' },
    { id: 's3', date: '2026-09-15', service: 'خلع', status: 'cancelled' },
  ],
});

describe('N27 — SSR HTML', () => {
  it('draws exactly one 🦷 card per session', () => {
    expect(ssrHtml).toContain('🦷');
    expect((ssrHtml.match(/حشوة/g) ?? []).length).toBe(1);
    expect((ssrHtml.match(/تلبيس زركون/g) ?? []).length).toBe(1);
    expect((ssrHtml.match(/خلع/g) ?? []).length).toBe(1);
  });

  it('states the plan status of every session in Arabic', () => {
    expect(ssrHtml).toContain('جلسة مكتملة');
    expect(ssrHtml).toContain('جلسة مخطّطة');
    expect(ssrHtml).toContain('جلسة ملغاة');
  });

  it('colours each procedure exactly like the 🦷 cards', () => {
    expect(ssrHtml).toContain('bg-blue-400'); // حشوة
    expect(ssrHtml).toContain('bg-amber-400'); // تلبيس
    expect(ssrHtml).toContain('bg-rose-400'); // خلع
    expect(ssrHtml).toContain('rgba(245,158,11,0.55)'); // hover glow of تلبيس
  });

  it('keeps the chronological order: appointment → sessions', () => {
    const positions = ['فحص دوري', 'خلع', 'تلبيس زركون', 'حشوة'].map((label) =>
      ssrHtml.indexOf(label)
    );
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('shows the tooth, the legend and the plan summary', () => {
    expect(ssrHtml).toContain('السن 36');
    expect(ssrHtml).toContain('🦷 جلسة');
    expect(ssrHtml).toContain('1 من 2 جلسات');
  });
});

/* ------------------------------------------------------------------ */
/* Source guards — the wiring a unit test cannot render                 */
/* ------------------------------------------------------------------ */

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

describe('N27 — wiring guards', () => {
  const profile = read('components/dashboard/patients/SmartPatientProfile.tsx');
  const page = read('app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx');
  const smartProfile = read('components/dashboard/patients/smartProfile.ts');

  it('merges metadata.sessions into the journey line on every path', () => {
    expect(profile).toContain(
      'const sessionTimeline: SmartTimelineItem[] = buildSessionTimelineItems(metadata.sessions);'
    );
    expect(profile).toContain('dedupeTimelineItems([...sessionTimeline, ...appointmentTimeline, ...noteTimeline])');
    expect(profile).toContain('sortTimelineDesc(');
  });

  it('renders the 🦷 session node with its procedure colour and plan state', () => {
    expect(profile).toContain('sessionProcedureTone');
    expect(profile).toContain('sessionStatusAr');
    expect(profile).toContain('sessionTone.bar');
    expect(profile).toContain('sessionTone.glow');
    expect(profile).toContain('🦷');
  });

  it('keeps the staggered entry and caps the delay for long timelines', () => {
    expect(profile).toContain('Math.min(idx, 10) * 0.07');
  });

  it('opens the 🦷 tab when a session event is clicked', () => {
    // N30 — routing is activity-aware now: a dental clinic opens the treatment
    // tab, while an imaging center (which never has a 🦷 tab) opens its own
    // referral tab for the same event instead of a dead end.
    expect(page).toContain(
      "item.iconType === 'session' ? (imagingMode ? 'requests' : 'sessions') : 'appointments'"
    );
  });

  it('exposes the N27 helpers from the domain module', () => {
    expect(smartProfile).toContain('export function buildSessionTimelineItems');
    expect(smartProfile).toContain('export function sessionTimelineStatus');
    expect(smartProfile).toContain('export function dedupeTimelineItems');
    expect(smartProfile).toContain('export function sortTimelineDesc');
  });
});

