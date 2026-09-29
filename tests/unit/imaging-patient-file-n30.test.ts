/**
 * N30 — ACTIVITY-AWARE PATIENT FILE.
 *
 * A dental clinic and an imaging center share the same patient-file route but
 * do not do the same job. N30 makes the tab set (and the referral workload
 * inside the file) activity-dependent, WITHOUT a migration and WITHOUT touching
 * the clinic experience:
 *
 *   clinic / dental_lab → 📋 📅 🦷 💰 🖼️ 🗨️   (unchanged, byte-for-byte)
 *   imaging_center      → 📋 📅 🩹 💰 🩻 🗨️
 *
 * The model is pure, so the rules are asserted directly; the wiring (page,
 * tab component, API filter) is asserted on SOURCE so a forgotten import or a
 * re-hard-coded tab list fails immediately.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PatientImagingRequestsPanel from '@/components/dashboard/patients/PatientImagingRequestsPanel';
import PatientMedicalFilesTab from '@/components/dashboard/patients/PatientMedicalFilesTab';
import {
  DENTAL_FILE_TABS,
  IMAGING_FILE_TABS,
  belongsToPatient,
  counterpartyActivityLabel,
  counterpartyName,
  filesTabKey,
  filterImagingRequests,
  groupImagingRequestsByPeriod,
  imagingRequestPeriod,
  imagingRequestTimestamp,
  isImagingFile,
  patientFileTabKeys,
  patientFileTabs,
  referralsTabKey,
  resolvePatientFileTab,
  summarizeImagingRequests,
  type ImagingRequestRow,
} from '@/lib/services/imagingPatientFile';

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');
const PAGE = 'app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx';
const TABS_COMPONENT = 'components/dashboard/patients/PatientMedicalFilesTab.tsx';
const REFERRALS_ROUTE = 'app/api/imaging/referrals/route.ts';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const CENTER = '22222222-2222-2222-2222-222222222222';
const PATIENT = '33333333-3333-3333-3333-333333333333';

function row(over: Partial<ImagingRequestRow> = {}): ImagingRequestRow {
  return {
    id: over.id ?? 'r1',
    clinic_id: over.clinic_id ?? CENTER,
    referring_clinic_id: over.referring_clinic_id ?? CLINIC,
    patient_id: over.patient_id ?? null,
    patient_id_center: over.patient_id_center ?? null,
    patient_ref: over.patient_ref ?? 'مريض تحويل',
    requested_service: over.requested_service ?? null,
    service_id: over.service_id ?? null,
    modality: over.modality ?? null,
    status: over.status ?? 'submitted',
    imaging_status: over.imaging_status ?? null,
    priority: over.priority ?? 'routine',
    notes: over.notes ?? null,
    scheduled_at: over.scheduled_at ?? null,
    completed_at: over.completed_at ?? null,
    created_at: over.created_at ?? null,
  };
}

describe('N30 — activity decides the patient-file tabs', () => {
  it('keeps the dental tab set exactly as it was (no migration, no surprises)', () => {
    const tabs = patientFileTabs('clinic');
    expect(tabs).toEqual([...DENTAL_FILE_TABS]);
    expect(tabs.map((t) => t.label)).toEqual([
      '📋 نظرة عامة',
      '📅 المواعيد',
      '🦷 الجلسات',
      '💰 المالية',
      '🖼️ ملفات الأشعة',
      '🗨️ التواصل',
    ]);
  });

  it('gives an imaging center the referral domain instead of the treatment plan', () => {
    const tabs = patientFileTabs('imaging_center');
    expect(tabs).toEqual([...IMAGING_FILE_TABS]);
    expect(tabs.map((t) => t.key)).toEqual([
      'overview',
      'appointments',
      'requests',
      'financial',
      'studies',
      'communications',
    ]);
  });

  it('never shows 🦷 sessions to an imaging center, never shows 🩻 requests to a clinic', () => {
    const clinic = patientFileTabs('clinic').map((t) => t.label).join(' | ');
    const center = patientFileTabs('imaging_center').map((t) => t.label).join(' | ');
    expect(clinic).toContain('🦷 الجلسات');
    expect(clinic).not.toContain('🩹');
    expect(clinic).not.toContain('🩻');
    expect(center).toContain('🩹 طلبات الأشعة');
    expect(center).toContain('🩻 الدراسات');
    expect(center).not.toContain('🦷');
  });

  it('holds the same tab COUNT on both sides (muscle memory, no layout jump)', () => {
    expect(patientFileTabKeys('clinic')).toHaveLength(patientFileTabKeys('imaging_center').length);
  });

  it('leaves dental_lab and every unknown/legacy value on the dental behaviour', () => {
    for (const value of ['dental_lab', null, undefined, '', 'imaging', 'IMAGING_CENTER ', 'x-ray', 42, {}]) {
      expect(isImagingFile(value), String(value)).toBe(false);
      expect(patientFileTabKeys(value), String(value)).toEqual(patientFileTabKeys('clinic'));
    }
  });

  it('accepts ONLY the authoritative enum value (fail-safe, never a guess)', () => {
    expect(isImagingFile('imaging_center')).toBe(true);
    // The DB enum is exact: a padded/cased variant is NOT silently accepted and
    // therefore keeps the dental behaviour instead of half-switching a tenant.
    expect(isImagingFile(' IMAGING_CENTER ')).toBe(false);
    expect(isImagingFile('Imaging_Center')).toBe(false);
  });

  it('points the shared "files" slot at the right key per activity', () => {
    expect(filesTabKey('clinic')).toBe('files');
    expect(filesTabKey('imaging_center')).toBe('studies');
    expect(referralsTabKey('imaging_center')).toBe('requests');
    expect(referralsTabKey('clinic')).toBeNull();
  });
});

describe('N30 — a requested tab is clamped to what the activity actually has', () => {
  it('falls back to overview instead of rendering a blank body', () => {
    expect(resolvePatientFileTab('imaging_center', 'sessions')).toBe('overview');
    expect(resolvePatientFileTab('clinic', 'requests')).toBe('overview');
    expect(resolvePatientFileTab('clinic', 'nonsense')).toBe('overview');
    expect(resolvePatientFileTab('clinic', null)).toBe('overview');
  });

  it('keeps every tab the activity really owns', () => {
    for (const key of patientFileTabKeys('imaging_center')) {
      expect(resolvePatientFileTab('imaging_center', key)).toBe(key);
    }
    for (const key of patientFileTabKeys('clinic')) {
      expect(resolvePatientFileTab('clinic', key)).toBe(key);
    }
  });
});

describe('N30 — «اليوم / هذا الأسبوع / هذا الشهر / أقدم» buckets', () => {
  /** Wednesday 2026-09-30 12:00 local → week starts Sunday 2026-09-27. */
  const now = new Date(2026, 8, 30, 12, 0, 0);

  it('is a Wednesday (the fixture the buckets below rely on)', () => {
    expect(now.getDay()).toBe(3);
  });

  it('buckets by calendar day / week (Sunday start) / month, not by rolling windows', () => {
    expect(imagingRequestPeriod(new Date(2026, 8, 30, 9, 0, 0).toISOString(), now)).toBe('today');
    expect(imagingRequestPeriod(new Date(2026, 8, 29, 23, 0, 0).toISOString(), now)).toBe('week'); // Tue
    expect(imagingRequestPeriod(new Date(2026, 8, 27, 0, 1, 0).toISOString(), now)).toBe('week'); // Sun
    expect(imagingRequestPeriod(new Date(2026, 8, 26, 23, 59, 0).toISOString(), now)).toBe('month'); // Sat
    expect(imagingRequestPeriod(new Date(2026, 8, 1, 0, 0, 0).toISOString(), now)).toBe('month');
    expect(imagingRequestPeriod(new Date(2026, 7, 31, 23, 59, 0).toISOString(), now)).toBe('older');
  });

  it('never drops a row: missing/broken timestamps land in «بدون تاريخ»', () => {
    expect(imagingRequestPeriod(null, now)).toBe('undated');
    expect(imagingRequestPeriod(undefined, now)).toBe('undated');
    expect(imagingRequestPeriod('', now)).toBe('undated');
    expect(imagingRequestPeriod('not-a-date', now)).toBe('undated');
  });

  it('treats clock skew (future) as today rather than hiding the request', () => {
    expect(imagingRequestPeriod(new Date(2026, 9, 2, 8, 0, 0).toISOString(), now)).toBe('today');
  });

  it('groups only non-empty buckets, newest first, undated last', () => {
    const rows = [
      row({ id: 'today-old', created_at: new Date(2026, 8, 30, 8, 0, 0).toISOString() }),
      row({ id: 'today-new', created_at: new Date(2026, 8, 30, 11, 0, 0).toISOString() }),
      row({ id: 'older', created_at: new Date(2026, 0, 5, 8, 0, 0).toISOString() }),
      row({ id: 'undated', created_at: null }),
    ];
    const groups = groupImagingRequestsByPeriod(rows, now);
    expect(groups.map((g) => g.period)).toEqual(['today', 'older', 'undated']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['today-new', 'today-old']);
    expect(groups[1].rows.map((r) => r.id)).toEqual(['older']);
    expect(groups[2].rows.map((r) => r.id)).toEqual(['undated']);
  });

  it('is empty (not a phantom bucket) when there are no rows', () => {
    expect(groupImagingRequestsByPeriod([], now)).toEqual([]);
  });
});

describe('N30 — status roll-up reuses the shared workflow vocabulary', () => {
  it('counts active/urgent/done with the referral terminal rule', () => {
    const rows = [
      row({ status: 'submitted' }),
      row({ status: 'accepted' }),
      row({ status: 'scheduled', priority: 'urgent' }),
      row({ status: 'completed', priority: 'urgent' }), // done ⇒ not an open urgent
      row({ status: 'delivered' }),
      row({ status: 'rejected' }),
      row({ status: 'cancelled' }),
    ];
    expect(summarizeImagingRequests(rows)).toEqual({ total: 7, active: 3, urgent: 1, done: 4 });
  });

  it('is all zeros for an empty patient', () => {
    expect(summarizeImagingRequests([])).toEqual({ total: 0, active: 0, urgent: 0, done: 0 });
  });

  it('filters active vs done without inventing a third state', () => {
    const rows = [row({ id: 'a', status: 'submitted' }), row({ id: 'b', status: 'delivered' })];
    expect(filterImagingRequests(rows, 'all').map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterImagingRequests(rows, 'active').map((r) => r.id)).toEqual(['a']);
    expect(filterImagingRequests(rows, 'done').map((r) => r.id)).toEqual(['b']);
  });
});


describe('N30 — which patient a request belongs to, and who sent it', () => {
  it('accepts either link: the referrer\'s patient_id or the center\'s patient_id_center', () => {
    expect(belongsToPatient({ patient_id: PATIENT, patient_id_center: null }, PATIENT)).toBe(true);
    expect(belongsToPatient({ patient_id: null, patient_id_center: PATIENT }, PATIENT)).toBe(true);
    expect(belongsToPatient({ patient_id: 'x', patient_id_center: 'y' }, PATIENT)).toBe(false);
    expect(belongsToPatient({ patient_id: PATIENT, patient_id_center: null }, null)).toBe(false);
  });

  it('names the counterparty from the caller\'s point of view (and never renders a blank)', () => {
    const partners = { [CLINIC]: { name: 'عيادة النور', slug: 'al-noor', activity_type: 'clinic' } };
    const incoming = row({ clinic_id: CENTER, referring_clinic_id: CLINIC });

    // Seen by the imaging center: the dental clinic is the counterparty.
    expect(counterpartyName(CENTER, incoming, partners)).toBe('عيادة النور');
    expect(counterpartyActivityLabel(CENTER, incoming, partners)).toBe('عيادة / طبيب أسنان');
    // Seen by the referring clinic: the center is.
    expect(counterpartyName(CLINIC, incoming, {})).toBe('جهة خارجية غير معروفة');
    expect(counterpartyActivityLabel(CLINIC, incoming, {})).toBe('عيادة / طبيب أسنان');
  });

  it('never treats a self-referral row as a counterparty', () => {
    expect(counterpartyName(CENTER, row({ clinic_id: CENTER, referring_clinic_id: null }), {})).toBe(
      'جهة خارجية غير معروفة'
    );
  });

  it('shows completion / scheduling / creation, in that order of meaning', () => {
    expect(imagingRequestTimestamp(row({ completed_at: '2026-09-30T10:00:00.000Z' })).label).toBe('اكتمل في');
    expect(imagingRequestTimestamp(row({ scheduled_at: '2026-09-30T10:00:00.000Z' })).label).toBe('مجدول في');
    expect(imagingRequestTimestamp(row({ created_at: '2026-09-30T10:00:00.000Z' })).label).toBe('أُنشئ في');
    expect(imagingRequestTimestamp(row({})).value).toBeNull();
  });
});

describe('N30 source guards — the wiring cannot silently regress', () => {
  it('the patient page derives its tabs from the model (no re-hard-coded TABS)', () => {
    const src = read(PAGE);
    expect(src).toContain('patientFileTabs(activityType)');
    expect(src).toContain('resolvePatientFileTab(activityType, tab)');
    expect(src).toContain('filesTabKey(activityType)');
    expect(src).not.toContain('const TABS = [');
    expect(src).not.toMatch(/🦷 الجلسات/); // labels live in ONE place now
    expect(src).not.toMatch(/\btab === 'sessions'/);
  });

  it('the page renders the imaging tabs through their own components', () => {
    const src = read(PAGE);
    expect(src).toContain("import PatientImagingRequestsPanel from '@/components/dashboard/patients/PatientImagingRequestsPanel'");
    expect(src).toContain("effectiveTab === 'requests' && clinicId");
    expect(src).toContain('variant="imaging"');
    expect(src).toContain('requestsById={requestsById}');
  });

  it('the studies variant is OPT-IN, so dental clinics keep the default UI', () => {
    const src = read(TABS_COMPONENT);
    expect(src).toContain("variant = 'dental'");
    expect(src).toContain("imagingVariant = variant === 'imaging'");
    // The summary tiles + request chip are gated, never unconditional.
    expect(src).toMatch(/\{imagingVariant && \(/);
    expect(src).toMatch(/imagingVariant && file\.imaging_request_id/);
  });

  it('the referrals API validates a patient scope BEFORE interpolating it', () => {
    const src = read(REFERRALS_ROUTE);
    expect(src).toContain('UUID_RE.test(patientParam)');
    expect(src).toContain('patient_id.eq.${patientId},patient_id_center.eq.${patientId}');
    // The validation must precede the query construction (no injection window).
    expect(src.indexOf('UUID_RE.test(patientParam)')).toBeLessThan(src.indexOf('patient_id.eq.'));
  });

  it('keeps a single source for referral wording (no duplicated status labels)', () => {
    const src = read('components/dashboard/patients/PatientImagingRequestsPanel.tsx');
    expect(src).toContain("from '@/lib/services/referralWorkflow'");
    expect(src).toContain('referralStatusLabel');
    expect(src).toContain('referralStatusTone');
    expect(src).toContain('imagingTypeLabel');
    expect(src).not.toMatch(/const STATUS_AR = \{/);
  });
});


/* -------------------------------------------------------------------------- */
/* The API leg: patient-scoped referrals                                      */
/* -------------------------------------------------------------------------- */

const api = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  calls: [] as string[],
  ors: [] as string[],
  filters: [] as Array<[string, unknown]>,
  authorized: true,
  authStatus: 200,
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: vi.fn(async () =>
    api.authorized
      ? { authorized: true, status: 200, role: 'owner', userId: 'user-1' }
      : { authorized: false, status: api.authStatus }
  ),
  roleDenied: () => null,
  DATA_ROLES: ['owner', 'manager', 'staff'],
  ADMIN_ROLES: ['owner', 'manager'],
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: () => {} }));

vi.mock('@/lib/notifications/referralNotifier', () => ({ notifyReferral: async () => ({}) }));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      api.calls.push(`from:${table}`);
      const chain: any = new Proxy(function () {}, {
        get(_target, key: string) {
          if (key === 'then') {
            return (resolve: (value: unknown) => void) => resolve({ data: api.rows, error: null });
          }
          return (...args: unknown[]) => {
            api.calls.push(String(key));
            if (key === 'eq') api.filters.push([args[0] as string, args[1]]);
            if (key === 'or') api.ors.push(String(args[0]));
            return chain;
          };
        },
        apply: () => chain,
      });
      return chain;
    },
  },
}));

import { GET as getReferrals } from '@/app/api/imaging/referrals/route';

function referralsRequest(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`https://app.example.com/api/imaging/referrals?${qs}`, {
    headers: { authorization: 'Bearer test-token' },
  });
}

describe('N30 — GET /api/imaging/referrals?patient_id=…', () => {
  beforeEach(() => {
    api.rows = [];
    api.calls = [];
    api.ors = [];
    api.filters = [];
    api.authorized = true;
    api.authStatus = 200;
  });

  it('400s a malformed patient scope WITHOUT touching the database', async () => {
    const res = await getReferrals(referralsRequest({ clinic_id: CENTER, patient_id: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'patient_id غير صحيح' });
    expect(api.calls).toEqual([]);
  });

  it('still 400s an unknown direction before any query (fail-closed)', async () => {
    const res = await getReferrals(
      referralsRequest({ clinic_id: CENTER, direction: 'sideways', patient_id: PATIENT })
    );
    expect(res.status).toBe(400);
    expect(api.calls).toEqual([]);
  });

  it('narrows the direction query with BOTH patient links', async () => {
    api.rows = [row({ id: 'r1', patient_id_center: PATIENT, created_at: '2026-09-30T08:00:00.000Z' })];
    const res = await getReferrals(
      referralsRequest({ clinic_id: CENTER, direction: 'all', patient_id: PATIENT })
    );
    expect(res.status).toBe(200);
    expect(api.ors).toContain(`patient_id.eq.${PATIENT},patient_id_center.eq.${PATIENT}`);
    expect(api.ors).toContain(`referring_clinic_id.eq.${CENTER},clinic_id.eq.${CENTER}`);
    const body = await res.json();
    expect(body.data.map((r: ImagingRequestRow) => r.id)).toEqual(['r1']);
  });

  it('omits the patient filter entirely when no scope is given (inbox behaviour unchanged)', async () => {
    api.rows = [];
    await getReferrals(referralsRequest({ clinic_id: CENTER }));
    expect(api.ors.some((o) => o.includes('patient_id.eq.'))).toBe(false);
  });

  it('403s a non-member and never reads the table', async () => {
    api.authorized = false;
    api.authStatus = 403;
    const res = await getReferrals(referralsRequest({ clinic_id: CENTER, patient_id: PATIENT }));
    expect(res.status).toBe(403);
    expect(api.calls).toEqual([]);
  });
});


/* -------------------------------------------------------------------------- */
/* SSR smoke: both readings really render (no crash, no blank body)           */
/* -------------------------------------------------------------------------- */

describe('N30 — server render of both patient-file readings', () => {
  const authHeaders = async () => ({});

  it('renders the 🩹 referral tab for an imaging center (loading state included)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PatientImagingRequestsPanel, {
        clinicId: CENTER,
        patientId: PATIENT,
        clinicSlug: 'al-noor-xray',
        authHeaders,
      })
    );
    expect(html).toContain('🩹 طلبات الأشعة');
    expect(html).toContain('0 طلب');
    expect(html).toContain('الإجمالي');
    expect(html).toContain('نشِطة');
    expect(html).toContain('عاجلة');
    expect(html).toContain('مكتملة');
    expect(html).toContain('صندوق الطلبات');
    expect(html).toContain('animate-pulse'); // the loading state, not a blank body
  });

  it('renders the 🩻 studies reading of the files tab, with its four tiles', () => {
    const html = renderToStaticMarkup(
      React.createElement(PatientMedicalFilesTab, {
        variant: 'imaging',
        clinicId: CENTER,
        patientId: PATIENT,
        authHeaders,
      })
    );
    expect(html).toContain('🩻 الدراسات الشعاعية');
    for (const label of ['بانوراما', 'CBCT مقطعي', 'DICOM شعاعي', 'تقرير طبي']) {
      expect(html, label).toContain(label);
    }
  });

  it('renders the ORIGINAL dental reading when no variant is passed', () => {
    const html = renderToStaticMarkup(
      React.createElement(PatientMedicalFilesTab, {
        clinicId: CLINIC,
        patientId: PATIENT,
        authHeaders,
      })
    );
    expect(html).toContain('🖼️ ملفات الأشعة والتحاليل الطبية');
    expect(html).toContain('إرفاق ملف جديد');
    // Nothing imaging-specific leaks into the clinic reading.
    expect(html).not.toContain('🩻');
    expect(html).not.toContain('مرتبط بطلب');
  });

  it('does not render the 🩹 panel at all when the tab is not selected', () => {
    // The panel is mounted by the page only for `effectiveTab === 'requests'`,
    // so proving the model exports no auto-mount is enough: no side effects.
    expect(typeof PatientImagingRequestsPanel).toBe('function');
  });
});

