import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GET as getPatients } from '@/app/api/patients/route';
import PatientsPage from '@/app/(dashboard)/dashboard/[clinicSlug]/patients/page';
import PatientPanel from '@/components/dashboard/patients/PatientPanel';
import PatientSearchBar from '@/components/dashboard/patients/PatientSearchBar';
import PatientSearchResult from '@/components/dashboard/patients/PatientSearchResult';
import {
  SEARCH_RESULT_LIMIT,
  formatDateLongAr,
  formatHijriAr,
  greetingAr,
  highlightSegments,
  isOnIsoDay,
  localIsoDay,
  matchesPatientQuery,
  normalizeArabic,
  patientInitials,
  patientSearchFields,
  patientStatusTone,
  sanitizeSearchQuery,
  scorePatientMatch,
  searchPatients,
} from '@/lib/services/patientSearch';

/**
 * N28 — «إعادة تصميم صفحة المرضى: بحث فقط».
 *
 * Three risks are pinned here:
 *
 * 1. ARABIC. Production stores `ابو خليل فريتخ`, and `ILIKE '%أبو خليل%'` matched
 *    ZERO rows (measured 2026-09-29). The fold (أ إ آ → ا · ة → ه · ى → ي ·
 *    ٠-٩ → 0-9) has to happen on BOTH sides of the comparison.
 * 2. PostgREST SYNTAX. `q` is interpolated into `.or()`; a comma used to reach
 *    Postgres verbatim → `failed to parse logic tree (...)` → HTTP 500 for a
 *    perfectly ordinary search. `sanitizeSearchQuery` must remove `,()`.
 * 3. THE CONTRACT. `/api/patients` must keep answering a BARE ARRAY (every other
 *    consumer depends on it) and the page must keep unwrapping the `{ data }`
 *    envelope for appointments (B48).
 */

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

/**
 * esbuild (vitest) compiles JSX with the CLASSIC runtime, while Next/SWC uses
 * the automatic one — so the app components reference a bare `React` identifier.
 * Exposing it globally is what lets the SSR block below render them unchanged.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/* -------------------------------------------------------------------------- */
/* Route-level harness: proves the comma can no longer reach PostgREST        */
/* -------------------------------------------------------------------------- */

const harness = vi.hoisted(() => ({
  /** Every `.or()` filter string the route built, and every `.limit()`. */
  or: [] as string[],
  limit: [] as number[],
  table: [] as string[],
  authorizeCalls: 0,
}));

vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({ isConfigured: true }),
  isSupabaseConfigured: () => true,
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: async () => {
    harness.authorizeCalls += 1;
    return { authorized: true, status: 200, role: 'owner' };
  },
}));

vi.mock('@/lib/supabase/admin', () => {
  const rows = [{ id: 'p1', clinic_id: 'c1', full_name: 'خالد منى', phone_number: null, email: null, notes: null, metadata: null }];
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: (value: number) => {
      harness.limit.push(value);
      return builder;
    },
    or: (filter: string) => {
      harness.or.push(filter);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return {
    supabaseAdmin: {
      from: (table: string) => {
        harness.table.push(table);
        return builder;
      },
    },
  };
});

/** SSR harness: `next/link` needs no App-Router context, only an anchor. */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href?: unknown; children?: unknown }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children as never),
}));

/** The four SSR scenarios run with a resolved clinic, no network at all. */
vi.mock('@/lib/useClinicContext', () => ({
  useClinicContext: () => ({
    clinicId: 'clinic-1',
    clinicSlug: 'amal-xray',
    authHeaders: async () => ({}),
    role: 'owner',
    loading: false,
    error: null,
  }),
}));

/**
 * A faithful-enough PostgREST `.or()` parser: arms are comma separated and each
 * arm must look like `column.operator.value`. A comma that came from USER INPUT
 * therefore splits `%خالد` away from `منى%` and the whole filter is rejected —
 * exactly the `failed to parse logic tree` 500 the owner hit.
 */
function postgrestWouldFail(filter: string): boolean {
  return filter
    .split(',')
    .some((arm) => !/^[a-z_]+\.(ilike|eq|neq|gt|lt)\./.test(arm) || /[()*]/.test(arm));
}

beforeEach(() => {
  harness.or.length = 0;
  harness.limit.length = 0;
  harness.table.length = 0;
  harness.authorizeCalls = 0;
});

type Row = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ROWS: Row[] = [
  { id: 'p1', name: 'ابو خليل فريتخ', phone: '+962790000001', status: 'جديد', source: 'موقع الويب' },
  { id: 'p2', name: 'خالدة سعيد', phone: '+962790000002', email: 'khalda@example.com', status: 'قيد المتابعة' },
  { id: 'p3', name: 'منى خالد', notes: 'حساسية من البنسلين', status: 'منتهي' },
  { id: 'p4', name: 'سماح محمود', metadata: { basic_info: { address: 'شارع المدينة، عمّان' } } },
  { id: 'p5', name: 'محمود عبد الله', metadata: { quick_notes: [{ text: 'يحتاج متابعة عصب' }] } },
  { id: 'p6', name: 'زينب حسين', email: 'zainab@clinic.test', status: 'متأخر' },
];

describe('N28 — normalizeArabic', () => {
  it('folds every hamza form to a bare alef', () => {
    expect(normalizeArabic('أحمد إبراهيم آدم')).toBe('احمد ابراهيم ادم');
  });

  it('folds ta-marbuta to ha and alef-maqsura to ya', () => {
    expect(normalizeArabic('منى خالدة')).toBe('مني خالده');
  });

  it('removes harakat and the tatweel', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
    expect(normalizeArabic('فـريتخ')).toBe('فريتخ');
  });

  it('maps Arabic-Indic digits onto latin ones', () => {
    expect(normalizeArabic('٠٧٩٩١٢٣٤٥٦')).toBe('0799123456');
    expect(normalizeArabic('۰۷۹')).toBe('079');
  });

  it('drops zero-width/bidi noise, lowercases latin and collapses spaces', () => {
    expect(normalizeArabic('AB\u200f  12')).toBe('ab 12');
  });

  it('returns "" for non-strings', () => {
    expect(normalizeArabic(null)).toBe('');
    expect(normalizeArabic(undefined)).toBe('');
    expect(normalizeArabic(42)).toBe('');
  });
});

describe('N28 — sanitizeSearchQuery (the 500 fix)', () => {
  it('never lets a comma reach the .or() filter', () => {
    const cleaned = sanitizeSearchQuery('خالد,منى');
    expect(cleaned).not.toContain(',');
    expect(cleaned).toBe('خالد منى');
  });

  it('strips parentheses, asterisks, colons, percent and quotes', () => {
    expect(sanitizeSearchQuery('أحمد (منزل) * %')).toBe('أحمد منزل');
    expect(sanitizeSearchQuery('a:b"c\'d')).toBe('a b c d');
  });

  it('keeps what matters: letters, dots, dashes, plus signs', () => {
    expect(sanitizeSearchQuery('د. خالد-علي +962')).toBe('د. خالد-علي +962');
  });

  it('returns "" when nothing usable is left (callers must skip the filter)', () => {
    expect(sanitizeSearchQuery(',,,()')).toBe('');
    expect(sanitizeSearchQuery('   ')).toBe('');
    expect(sanitizeSearchQuery(undefined)).toBe('');
  });

  it('bounds the query length', () => {
    expect(sanitizeSearchQuery('ا'.repeat(400)).length).toBe(120);
  });
});

describe('N28 — searchPatients', () => {
  it('renders nothing for an empty query (no list-on-open by design)', () => {
    const outcome = searchPatients(ROWS, '   ');
    expect(outcome.results).toEqual([]);
    expect(outcome.total).toBe(0);
    expect(outcome.query).toBe('');
    expect(matchesPatientQuery(ROWS[0], '')).toBe(false);
  });

  it('survives a comma instead of blowing up on the server filter', () => {
    const outcome = searchPatients(ROWS, 'خالد,منى');
    // "خالد منى" (one folded needle) — it must not throw and must not match all.
    expect(outcome.results.length).toBeLessThanOrEqual(ROWS.length);
    expect(outcome.query).not.toContain(',');
  });

  it('finds ابو خليل فريتخ when the caller types the hamza form «أبو خليل»', () => {
    const outcome = searchPatients(ROWS, 'أبو خليل');
    expect(outcome.results.map((row) => row.id)).toEqual(['p1']);
    expect(outcome.total).toBe(1);
  });

  it('finds خالدة when the caller types the ha form «خالده»', () => {
    const outcome = searchPatients(ROWS, 'خالده');
    expect(outcome.results.map((row) => row.id)).toEqual(['p2']);
  });

  it('searches the phone, email, notes and metadata surfaces too', () => {
    expect(searchPatients(ROWS, '٧٩٠٠٠٠٠٠١').results.map((row) => row.id)).toEqual(['p1']);
    expect(searchPatients(ROWS, 'zainab').results.map((row) => row.id)).toEqual(['p6']);
    expect(searchPatients(ROWS, 'البنسلين').results.map((row) => row.id)).toEqual(['p3']);
    expect(searchPatients(ROWS, 'عمان').results.map((row) => row.id)).toEqual(['p4']);
    expect(searchPatients(ROWS, 'متابعة عصب').results.map((row) => row.id)).toEqual(['p5']);
  });

  it('ranks a name-start hit above a word-start hit', () => {
    const outcome = searchPatients(ROWS, 'مح');
    expect(outcome.results.map((row) => row.id)).toEqual(['p5', 'p4']);
  });

  it('caps the visible list at 10 but reports the real total', () => {
    const many: Row[] = Array.from({ length: 25 }, (_, index) => ({
      id: `m${index}`,
      name: `مريض تجريبي ${index}`,
    }));
    const capped = searchPatients(many, 'تجريبي');
    expect(capped.results.length).toBe(SEARCH_RESULT_LIMIT);
    expect(capped.total).toBe(25);
    expect(capped.hasMore).toBe(true);

    const expanded = searchPatients(many, 'تجريبي', 25);
    expect(expanded.results.length).toBe(25);
    expect(expanded.hasMore).toBe(false);
  });
});

describe('N28 — scorePatientMatch (the ranking ladder)', () => {
  it('orders exact > name-start > word-start > contains > phone > email > other', () => {
    const exact = scorePatientMatch({ id: 'x', name: 'منى خالد' }, 'منى خالد');
    const nameStart = scorePatientMatch({ id: 'x', name: 'منى خالد' }, 'منى');
    const wordStart = scorePatientMatch({ id: 'x', name: 'منى خالد' }, 'خالد');
    const contains = scorePatientMatch({ id: 'x', name: 'سماح محمود' }, 'حمو');
    const phone = scorePatientMatch({ id: 'x', name: 'سماح محمود', phone: '+962790000002' }, '790000');
    const email = scorePatientMatch({ id: 'x', name: 'سماح محمود', email: 'samah@x.test' }, 'samah@');
    const other = scorePatientMatch({ id: 'x', name: 'سماح محمود', notes: 'تقرير أشعة' }, 'تقرير');
    expect(exact).toBeGreaterThan(nameStart);
    expect(nameStart).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(phone);
    expect(phone).toBeGreaterThan(email);
    expect(email).toBeGreaterThan(other);
    expect(scorePatientMatch({ id: 'x', name: 'سماح محمود' }, 'لا يوجد')).toBe(0);
  });
});

describe('N28 — highlightSegments keeps the ORIGINAL spelling', () => {
  it('paints the matched slice of the stored text, hamza and all', () => {
    const segments = highlightSegments('ابو خليل فريتخ', 'أبو خليل');
    expect(segments.map((segment) => segment.text).join('')).toBe('ابو خليل فريتخ');
    expect(segments.find((segment) => segment.hit)?.text).toBe('ابو خليل');
  });

  it('splits a middle match into plain / hit / plain', () => {
    const segments = highlightSegments('منى خالد', 'خالد');
    expect(segments).toEqual([
      { text: 'منى ', hit: false },
      { text: 'خالد', hit: true },
    ]);
  });

  it('falls back to one plain segment when there is nothing to paint', () => {
    expect(highlightSegments('منى خالد', 'زينب')).toEqual([{ text: 'منى خالد', hit: false }]);
    expect(highlightSegments('منى خالد', '')).toEqual([{ text: 'منى خالد', hit: false }]);
  });
});

describe('N28 — presentation helpers', () => {
  it('builds avatar initials that survive one-word and empty names', () => {
    expect(patientInitials('ابو خليل فريتخ')).toBe('اخ');
    expect(patientInitials('منى')).toBe('من');
    expect(patientInitials('   ')).toBe('؟');
  });

  it('uses 🟢 نشط · 🟡 متابعة · ⚫ منتهي · 🔴 متأخر and ⚪ for a missing status', () => {
    expect(patientStatusTone('جديد').emoji).toBe('🟢');
    expect(patientStatusTone('نشط').emoji).toBe('🟢');
    expect(patientStatusTone('قيد المتابعة').emoji).toBe('🟡');
    expect(patientStatusTone('منتهي').emoji).toBe('⚫');
    expect(patientStatusTone('مؤرشف').emoji).toBe('⚫');
    expect(patientStatusTone('متأخر').emoji).toBe('🔴');
    // «غير نشط» contains «نشط» — it must NOT be painted green.
    expect(patientStatusTone('غير نشط').emoji).toBe('🔴');
    // 22 of the 43 production rows have no status at all.
    expect(patientStatusTone(null).emoji).toBe('⚪');
    expect(patientStatusTone(null).label).toBe('غير محدّد');
    // The stored label is shown as-is, never replaced by the tone name.
    expect(patientStatusTone('قيد المتابعة').label).toBe('قيد المتابعة');
  });

  it('greets by the clock', () => {
    expect(greetingAr(new Date(2026, 8, 29, 9, 0))).toEqual({ text: 'صباح الخير', emoji: '☀️' });
    expect(greetingAr(new Date(2026, 8, 29, 19, 0))).toEqual({ text: 'مساء الخير', emoji: '🌙' });
  });

  it('prints a long Arabic date and, when ICU has the data, a Hijri one', () => {
    const long = formatDateLongAr(new Date(2026, 8, 29));
    expect(long).toContain('2026');
    const hijri = formatHijriAr(new Date(2026, 8, 29));
    expect(hijri === null || hijri.includes('هـ')).toBe(true);
  });

  it('computes the local ISO day used by the "new files today" tile', () => {
    expect(localIsoDay(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
    expect(isOnIsoDay('2026-09-29T10:00:00.000Z', '2026-09-29')).toBe(true);
    expect(isOnIsoDay('2026-09-28T10:00:00.000Z', '2026-09-29')).toBe(false);
    expect(isOnIsoDay(null, '2026-09-29')).toBe(false);
  });

  it('exposes the four contract fields plus the metadata surfaces', () => {
    const fields = patientSearchFields(ROWS[0]);
    expect(fields).toContain('ابو خليل فريتخ');
    expect(fields).toContain('+962790000001');
    expect(fields).toContain('موقع الويب');
    expect(fields.some((field) => field.trim().length === 0)).toBe(false);
    expect(patientSearchFields(ROWS[3]).join(' ')).toContain('عمّان');
    expect(patientSearchFields(ROWS[4]).join(' ')).toContain('عصب');
  });
});

describe('N28 — wiring guards', () => {
  const api = read('app/api/patients/route.ts');
  const page = read('app/(dashboard)/dashboard/[clinicSlug]/patients/page.tsx');
  const bar = read('components/dashboard/patients/PatientSearchBar.tsx');
  const panel = read('components/dashboard/patients/PatientPanel.tsx');

  it('the API sanitises q before it can reach the PostgREST .or() filter', () => {
    expect(api).toContain('sanitizeSearchQuery(url.searchParams.get(');
    expect(api).not.toContain('full_name.ilike.%${searchQuery}%');
    expect(api).toContain('notes.ilike.');
  });

  it('the API keeps answering a BARE ARRAY and caps ?limit', () => {
    expect(api).toContain('NextResponse.json((data || []).map(toPatientShape))');
    expect(api).toContain('MAX_LIMIT');
    expect(api).toContain('Number(url.searchParams.get(\'limit\'))');
  });

  it('the page is search-only: no patient list, no pagination anywhere', () => {
    expect(page).not.toContain('التالي');
    expect(page).not.toContain('السابق');
    expect(page).toContain('searchPatients');
    expect(page).toContain('SEARCH_RESULT_LIMIT');
    expect(page).toContain('عرض الكل');
  });

  it('the page still unwraps the { data } envelope for appointments (B48 regression)', () => {
    expect(page).toContain('Array.isArray(body?.data)');
    expect(page).toContain('&patient_id=${encodeURIComponent(selected.id)}');
  });

  it('the bar debounces at 300ms and the panel still has the three buttons', () => {
    expect(bar).toContain('SEARCH_DEBOUNCE_MS = 300');
    expect(panel).toContain('📋');
    expect(panel).toContain('💊');
    expect(panel).toContain('📁');
  });
});

describe('N28 — GET /api/patients: the comma 500 is gone', () => {
  const call = (query: string) =>
    getPatients(new Request(`http://localhost/api/patients?clinic_id=c1&${query}`));

  it('never lets a user comma reach the .or() filter', async () => {
    const response = await call(`q=${encodeURIComponent('خالد,منى')}`);
    expect(response.status).toBe(200);
    expect(harness.or.length).toBe(1);

    const filter = harness.or[0];
    // The old, raw-interpolated shape really is rejected by PostgREST…
    expect(postgrestWouldFail('full_name.ilike.%خالد,منى%,phone_number.ilike.%خالد,منى%')).toBe(true);
    // …and the one the route now builds is not.
    expect(postgrestWouldFail(filter)).toBe(false);
    expect(filter).toContain('full_name.ilike.%خالد منى%');
  });

  it('searches the name, phone, email AND notes columns', async () => {
    await call(`q=${encodeURIComponent('079000001')}`);
    const filter = harness.or[0];
    for (const arm of ['full_name.ilike.', 'phone_number.ilike.', 'email.ilike.', 'notes.ilike.']) {
      expect(filter).toContain(arm);
    }
  });

  it('skips the filter entirely when the query sanitises to nothing', async () => {
    const response = await call(`q=${encodeURIComponent(',,()')}`);
    expect(response.status).toBe(200);
    expect(harness.or).toEqual([]);
  });

  it('defaults to 50 rows, honours ?limit and caps it at 500', async () => {
    // `harness.limit` keeps every call of this test — assert the newest one.
    await call(`q=${encodeURIComponent('خالد')}`);
    expect(harness.limit.at(-1)).toBe(50);
    await call(`q=${encodeURIComponent('خالد')}&limit=200`);
    expect(harness.limit.at(-1)).toBe(200);
    await call(`q=${encodeURIComponent('خالد')}&limit=99999`);
    expect(harness.limit.at(-1)).toBe(500);
    await call(`q=${encodeURIComponent('خالد')}&limit=0`);
    expect(harness.limit.at(-1)).toBe(50);
    await call(`q=${encodeURIComponent('خالد')}&limit=abc`);
    expect(harness.limit.at(-1)).toBe(50);
  });

  it('still answers a BARE ARRAY of patientShape rows', async () => {
    const response = await call(`q=${encodeURIComponent('خالد')}`);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0]).toMatchObject({ name: 'خالد منى', status: 'جديد' });
    expect(harness.table).toEqual(['patients']);
  });

  it('refuses a request with no clinic_id before touching the database', async () => {
    const response = await getPatients(new Request('http://localhost/api/patients'));
    expect(response.status).toBe(400);
    expect(harness.authorizeCalls).toBe(0);
    expect(harness.or).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* SSR — the four scenarios the owner asked to see                            */
/* -------------------------------------------------------------------------- */

const SSR_PATIENT = {
  id: 'p1',
  name: 'ابو خليل فريتخ',
  phone: '+962790000001',
  email: 'khalil@example.com',
  source: 'موقع الويب',
  status: 'قيد المتابعة',
  created_at: '2026-09-01T10:00:00.000Z',
  notes: null,
  metadata: { age: '44', sessions: [{ id: 's1', date: '2026-09-10', service: 'حشوة', tooth: '36', status: 'done' }] },
};

describe('N28 — SSR scenarios', () => {
  it('(أ) the page opens EMPTY: greeting + date + search + day summary, no list', () => {
    const html = renderToStaticMarkup(createElement(PatientsPage));
    // greeting (morning or evening depending on the build clock) + a date line
    expect(/صباح الخير|مساء الخير/.test(html)).toBe(true);
    // the single entry point
    expect(html).toContain('id="patient-search-input"');
    expect(html).toContain('ابحث بالاسم أو الهاتف أو البريد أو الملاحظة');
    // the three summary tiles, as skeletons on the first paint
    expect(html).toContain('📅');
    expect(html).toContain('🩻');
    expect(html).toContain('💰');
    expect(html).toContain('animate-pulse');
    // no patient list, no pagination, no results block
    expect(html).not.toContain('لا نتائج مطابقة');
    expect(html).not.toContain('عرض الكل');
    expect(html).not.toContain('التالي');
    expect(html).not.toContain('السابق');
    expect(html).not.toContain('ابو خليل');
  });

  it('(ب) SEARCH: the bar shows the debounced draft + count, the row highlights the hit', () => {
    const barHtml = renderToStaticMarkup(
      createElement(PatientSearchBar, { value: 'أبو خليل', onChange: () => {}, loading: true, hint: '3 نتائج' })
    );
    expect(barHtml).toContain('role="search"');
    expect(barHtml).toContain('3 نتائج');
    expect(barHtml).toContain('aria-label="مسح البحث"');
    // the draft the bar was seeded with (React renders `value` as an attribute)
    expect(barHtml).toContain('value="أبو خليل"');

    const rowHtml = renderToStaticMarkup(
      createElement(PatientSearchResult, { patient: SSR_PATIENT, query: 'أبو خليل', active: true, onSelect: () => {} })
    );
    // the ORIGINAL spelling is what gets painted inside <mark>
    expect(rowHtml).toContain('<mark');
    expect(rowHtml).toContain('ابو خليل');
    expect(rowHtml).toContain('dir="ltr"');
    expect(rowHtml).toContain('قيد المتابعة');
    expect(rowHtml).toContain('🟡');
  });

  it('(ج) SELECTION: the panel renders under the results with the patient header', () => {
    const html = renderToStaticMarkup(
      createElement(PatientPanel, {
        patient: SSR_PATIENT,
        clinicId: 'clinic-1',
        clinicSlug: 'amal-xray',
        authHeaders: async () => ({}),
        appointments: [
          { id: 'a1', service: 'حشوة', appointment_date: '2026-09-20', appointment_time: '10:30', status: 'completed' },
        ],
        appointmentsLoading: false,
        onEdit: () => {},
        onClose: () => {},
        onDelete: () => {},
        onAddSession: async () => {},
        onSessionStatusChange: async () => {},
      })
    );
    expect(html).toContain('ابو خليل فريتخ');
    expect(html).toContain('+962790000001');
    expect(html).toContain('🎂');
    expect(html).toContain('تعديل');
    expect(html).toContain('✕');
    // the default tab is 📋 معلومات
    expect(html).toContain('تاريخ التسجيل');
    expect(html).toContain('آخر زيارة');
    expect(html).toContain('مصدر التسجيل');
  });

  it('(د) the THREE buttons are in the markup: 📋 معلومات · 💊 العلاج · 📁 ملفات', () => {
    const html = renderToStaticMarkup(
      createElement(PatientPanel, {
        patient: SSR_PATIENT,
        clinicId: 'clinic-1',
        clinicSlug: 'amal-xray',
        authHeaders: async () => ({}),
        appointments: [],
        appointmentsLoading: true,
        onEdit: () => {},
        onClose: () => {},
        onDelete: () => {},
        onAddSession: async () => {},
        onSessionStatusChange: async () => {},
      })
    );
    expect(html).toContain('📋');
    expect(html).toContain('معلومات');
    expect(html).toContain('💊');
    expect(html).toContain('العلاج');
    expect(html).toContain('📁');
    expect(html).toContain('ملفات');
    // only the active tab body is rendered (lazy tabs), and appointments still
    // loading means a skeleton — never the words "جارٍ التحميل".
    expect(html).not.toContain('نسبة الإكمال');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('جارٍ التحميل');
  });
});

