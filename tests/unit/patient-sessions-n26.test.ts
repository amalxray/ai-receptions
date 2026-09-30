import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendPatientSession,
  emptyMetadata,
  parsePatientMetadata,
  parsePatientSessions,
  serializePatientMetadata,
  sessionId,
  sessionProcedureTone,
  sessionProgress,
  sessionStatusAr,
  updatePatientSession,
  type PatientSession,
} from '@/components/dashboard/patients/smartProfile';

/**
 * N26 — 🦷 الجلسات (the dental treatment plan).
 *
 * The plan is stored in `patients.metadata.sessions` (no migration), so the whole
 * feature hinges on one promise: malformed JSONB must never break the patient
 * file, and a session must never wipe a sibling metadata key.
 */

const session = (over: Partial<PatientSession> = {}): PatientSession => ({
  id: '2026-09-01|حشوة',
  date: '2026-09-01',
  service: 'حشوة',
  status: 'done',
  ...over,
});

describe('N26 — parsePatientSessions tolerance', () => {
  it('reads a well-formed plan', () => {
    const parsed = parsePatientSessions([
      { id: 's1', date: '2026-09-01', service: 'حشوة', tooth: '36', status: 'done', note: 'بنج موضعي' },
      { id: 's2', date: '2026-09-08', service: 'تنظيف', status: 'planned' },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: 's1',
      date: '2026-09-01',
      service: 'حشوة',
      tooth: '36',
      treatment_type: 'حشوة',
      status: 'done',
      note: 'بنج موضعي',
    });
    expect(parsed[1].tooth).toBeUndefined();
  });

  it('synthesises a stable id for legacy entries that have none', () => {
    const first = parsePatientSessions([{ date: '2026-09-01', service: 'خلع', status: 'done' }]);
    const second = parsePatientSessions([{ date: '2026-09-01', service: 'خلع', status: 'done' }]);
    expect(first[0].id).toBe(sessionId('2026-09-01', 'خلع'));
    expect(first[0].id).toBe(second[0].id);
  });

  it('normalises Arabic statuses and falls back to planned for junk', () => {
    expect(parsePatientSessions([{ service: 'عصب', status: 'مكتملة' }])[0].status).toBe('done');
    expect(parsePatientSessions([{ service: 'عصب', status: 'تمت' }])[0].status).toBe('done');
    expect(parsePatientSessions([{ service: 'عصب', status: 'ملغاة' }])[0].status).toBe('cancelled');
    expect(parsePatientSessions([{ service: 'عصب', status: '???بلا معنى' }])[0].status).toBe('planned');
    expect(parsePatientSessions([{ service: 'عصب' }])[0].status).toBe('planned');
  });

  it('accepts a bare string and drops everything unusable', () => {
    const parsed = parsePatientSessions(['تنظيف', null, 42, {}, { service: '   ' }, ['x']]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].service).toBe('تنظيف');
  });

  it('keeps two sessions on the same day for the same service', () => {
    const parsed = parsePatientSessions([
      { date: '2026-09-01', service: 'حشوة', status: 'done' },
      { date: '2026-09-01', service: 'حشوة', status: 'planned' },
    ]);
    expect(parsed).toHaveLength(2);
    expect(new Set(parsed.map((entry) => entry.id)).size).toBe(2);
  });

  it('returns an empty plan for non-array junk instead of throwing', () => {
    expect(parsePatientSessions(null)).toEqual([]);
    expect(parsePatientSessions('حشوة')).toEqual([]);
    expect(parsePatientSessions({})).toEqual([]);
  });

  it('keeps the new N33 treatment fields without breaking legacy sessions', () => {
    const parsed = parsePatientSessions([
      {
        id: 's1',
        date: '2026-09-01',
        service: 'حشوة ضرس',
        treatment_type: 'حشوة',
        doctor_id: 'provider-42',
        next_plan: 'مراجعة بعد 7 أيام',
        status: 'done',
        note: 'تقدم جيد',
      },
      { date: '2026-09-08', service: 'تنظيف', status: 'planned' },
    ]);

    expect(parsed[0]).toMatchObject({
      treatment_type: 'حشوة',
      doctor_id: 'provider-42',
      next_plan: 'مراجعة بعد 7 أيام',
      service: 'حشوة ضرس',
      status: 'done',
    });
    expect(parsed[1].treatment_type).toBe('تنظيف');
  });
});

describe('N26 — sessionProgress ("ما تم / ما بقي")', () => {
  it('counts done / remaining and keeps cancelled out of the plan', () => {
    const progress = sessionProgress([
      session({ id: '1', status: 'done' }),
      session({ id: '2', status: 'done' }),
      session({ id: '3', status: 'done' }),
      session({ id: '4', status: 'planned' }),
      session({ id: '5', status: 'planned' }),
      session({ id: '6', status: 'planned' }),
      session({ id: '7', status: 'cancelled' }),
    ]);
    expect(progress).toEqual({ total: 6, done: 3, remaining: 3, cancelled: 1, percent: 50, label: '3 من 6 جلسات' });
  });

  it('renders "3 من 6 جلسات" exactly as the owner asked', () => {
    const sessions = [
      session({ id: 'a', status: 'done' }),
      session({ id: 'b', status: 'done' }),
      session({ id: 'c', status: 'done' }),
      session({ id: 'd', status: 'planned' }),
      session({ id: 'e', status: 'planned' }),
      session({ id: 'f', status: 'planned' }),
    ];
    expect(sessionProgress(sessions).label).toBe('3 من 6 جلسات');
  });

  it('reports 0% — never NaN — for an empty plan', () => {
    const progress = sessionProgress([]);
    expect(progress).toEqual({ total: 0, done: 0, remaining: 0, cancelled: 0, percent: 0, label: '0 من 0 جلسات' });
    expect(Number.isNaN(progress.percent)).toBe(false);
  });
});

describe('N26 — appendPatientSession', () => {
  const baseMetadata = {
    source: 'walk-in',
    status: 'active',
    quick_notes: [{ text: 'حساسية من البنسلين', date: '2026-09-01T10:00:00.000Z' }],
    medical_history: { allergies: ['بنسلين'], chronic: ['ضغط'] },
    insurance: { provider: 'التأمين الوطني' },
  };

  it('puts the newest session first', () => {
    const first = appendPatientSession(baseMetadata, { date: '2026-09-01', service: 'حشوة', status: 'done' });
    const second = appendPatientSession(first, { date: '2026-09-08', service: 'تنظيف', status: 'planned' });
    expect(second.sessions.map((entry) => entry.service)).toEqual(['تنظيف', 'حشوة']);
  });

  it('never touches a sibling metadata key', () => {
    const next = appendPatientSession(baseMetadata, { date: '2026-09-01', service: 'حشوة', status: 'done' });
    expect(next.quick_notes).toHaveLength(1);
    expect(next.medical_history.allergies).toEqual(['بنسلين']);
    expect(next.insurance.provider).toBe('التأمين الوطني');
    expect((next as Record<string, unknown>).source).toBe('walk-in');
    expect((next as Record<string, unknown>).status).toBe('active');
  });

  it('ignores an empty service and keeps the plan untouched', () => {
    const next = appendPatientSession(baseMetadata, { date: '2026-09-01', service: '   ', status: 'done' });
    expect(next.sessions).toEqual([]);
  });

  it('does not store the same session twice', () => {
    const once = appendPatientSession(baseMetadata, { id: 's1', date: '2026-09-01', service: 'حشوة', status: 'done' });
    const twice = appendPatientSession(once, { id: 's1', date: '2026-09-01', service: 'حشوة', status: 'done' });
    expect(twice.sessions).toHaveLength(1);
  });

  it('bounds the plan at max', () => {
    let metadata = parsePatientMetadata(baseMetadata);
    for (let index = 0; index < 7; index += 1) {
      metadata = appendPatientSession(metadata, { date: `2026-09-0${index + 1}`, service: `جلسة ${index}`, status: 'done' }, 5);
    }
    expect(metadata.sessions).toHaveLength(5);
    expect(metadata.sessions[0].service).toBe('جلسة 6');
  });
});

describe('N26 — updatePatientSession', () => {
  const plan = { sessions: [
    { id: 's1', date: '2026-09-01', service: 'حشوة', status: 'planned' },
    { id: 's2', date: '2026-09-08', service: 'تنظيف', status: 'planned' },
  ], quick_notes: [{ text: 'ملاحظة', date: '2026-09-01T10:00:00.000Z' }] };

  it('يعدّل الجلسة المستهدفة فقط — إكمال واحدة لا يمسّ البقية', () => {
    const next = updatePatientSession(plan, 's1', { status: 'done' });
    expect(next.sessions[0].status).toBe('done');
    expect(next.sessions[1].status).toBe('planned');
    expect(next.quick_notes).toHaveLength(1);
  });

  it('supports cancel and undo', () => {
    const cancelled = updatePatientSession(plan, 's2', { status: 'cancelled' });
    expect(sessionProgress(cancelled.sessions).total).toBe(1);
    const reopened = updatePatientSession(cancelled, 's2', { status: 'planned' });
    expect(sessionProgress(reopened.sessions).total).toBe(2);
  });

  it('is a no-op for an unknown id', () => {
    const next = updatePatientSession(plan, 'ghost', { status: 'done' });
    expect(next.sessions).toEqual(parsePatientSessions(plan.sessions));
  });
});

describe('N26 — procedure colours', () => {
  it('maps each procedure to its colour family', () => {
    expect(sessionProcedureTone('حشوة').emoji).toBe('🟦');
    expect(sessionProcedureTone('علاج عصب').emoji).toBe('🟪');
    expect(sessionProcedureTone('خلع ضرس').emoji).toBe('🟥');
    expect(sessionProcedureTone('تلبيس زركون').emoji).toBe('🟨');
    expect(sessionProcedureTone('تنظيف جير').emoji).toBe('🟩');
  });

  it('matches by substring so a real service label still lands on the colour', () => {
    expect(sessionProcedureTone('حشوة ضرس 36').bar).toContain('blue');
    expect(sessionProcedureTone('قلع جراحي').bar).toContain('rose');
  });

  it('falls back to the neutral tooth for anything unknown', () => {
    expect(sessionProcedureTone('استشارة').emoji).toBe('🦷');
    expect(sessionProcedureTone('').emoji).toBe('🦷');
    expect(sessionProcedureTone(null).emoji).toBe('🦷');
  });

  it('labels the three states in Arabic', () => {
    expect(sessionStatusAr('done')).toBe('مكتملة');
    expect(sessionStatusAr('planned')).toBe('مخطّطة');
    expect(sessionStatusAr('cancelled')).toBe('ملغاة');
  });
});

describe('N26 — serialization round trip', () => {
  it('writes the plan back normalised and keeps unknown keys', () => {
    const out = serializePatientMetadata({
      source: 'portal',
      sessions: [{ date: '2026-09-01', service: 'حشوة', status: 'منجزة', junk: 'drop me' }],
    });
    expect(out.source).toBe('portal');
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions?.[0].status).toBe('done');
    expect((out.sessions?.[0] as Record<string, unknown>).junk).toBeUndefined();
  });

  it('omits the key entirely when the plan is empty', () => {
    expect(serializePatientMetadata({ source: 'portal' }).sessions).toBeUndefined();
    expect(emptyMetadata().sessions).toEqual([]);
  });
});

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

describe('N26 — wiring guards', () => {
  const page = read('app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx');
  const panel = read('components/dashboard/patients/PatientSessionsPanel.tsx');
  const profile = read('components/dashboard/patients/smartProfile.ts');

  it('adds the 🦷 الجلسات tab to the patient file', () => {
    // N30 — the tab SET now has ONE source (`patientFileTabs`): a dental clinic
    // still gets the 🦷 tab (and an imaging center deliberately does not). The
    // page renders whatever the model returns for the active activity_type.
    const model = read('lib/services/imagingPatientFile.ts');
    expect(model).toContain("{ key: 'sessions', label: '🦷 الجلسات' },");
    expect(page).toContain('patientFileTabs(activityType)');
    expect(page).toContain('{tabs.map((t) => (');
    expect(page).toContain('SessionsSkeleton');
  });

  it('sends ONLY the sessions key — never a whole metadata object', () => {
    expect(page).toContain('body: JSON.stringify({ metadata: { sessions: next.sessions } })');
    expect(page).not.toContain('body: JSON.stringify({ metadata: patient.metadata');
  });

  it('renders the plan in the tab and in the overview', () => {
    expect(page).toContain('variant="full"');
    expect(page).toContain('variant="compact"');
    expect(page).toContain('onStatusChange={changeSessionStatus}');
  });

  it('shows a skeleton instead of a text loading line', () => {
    expect(panel).toContain('animate-pulse');
    expect(panel).toContain('aria-busy="true"');
    expect(panel).not.toContain('>جارٍ التحميل');
    expect(page).not.toContain('جارٍ التحميل...');
  });

  it('carries the required visual feedback', () => {
    expect(panel).toContain('backdrop-blur-md');       // modal backdrop
    expect(panel).toContain('تسجيل جلسة مكتملة');       // complete button
    expect(panel).toContain('setBursts');              // ripple
    expect(panel).toContain('خطة العلاج');              // progress bar
    expect(profile).toContain("export const SESSION_STATUS_AR");
  });
});
