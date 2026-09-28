import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  appendQuickNote,
  buildWhatsAppHref,
  normalizePhoneForWhatsApp,
  parsePatientMetadata,
} from '@/components/dashboard/patients/smartProfile';

/**
 * B38 — the patient profile built its WhatsApp link by hand
 * (`wa.me/${phone.replace(/[^0-9]/g, '')}`), so a Palestinian local number
 * `0599123456` produced `https://wa.me/0599123456` and WhatsApp answered
 * "phone number shared via url is invalid". The shared normalizer (dead code
 * until now) must resolve it to `970599123456`.
 *
 * B39 — "ملاحظة سريعة" only toggled a collapsed block, so no note was ever
 * stored. Notes now go through appendQuickNote into `metadata.quick_notes`.
 */
describe('B38 — WhatsApp link normalization', () => {
  it('prefixes the Palestinian country code (+970) and drops the leading 0', () => {
    expect(normalizePhoneForWhatsApp('0599123456')).toBe('970599123456');
    expect(normalizePhoneForWhatsApp('0599 123 456')).toBe('970599123456');
    expect(normalizePhoneForWhatsApp('059-912-3456')).toBe('970599123456');
  });

  it('keeps numbers that already carry +970 or 00970 intact', () => {
    expect(normalizePhoneForWhatsApp('+970599123456')).toBe('970599123456');
    expect(normalizePhoneForWhatsApp('00970599123456')).toBe('970599123456');
    expect(normalizePhoneForWhatsApp('+962 79 123 4567')).toBe('962791234567');
  });

  it('accepts landlines and rejects unusable input instead of emitting a broken link', () => {
    expect(normalizePhoneForWhatsApp('02 298 1234')).toBe('97022981234');
    expect(normalizePhoneForWhatsApp('599123456')).toBe('599123456');
    expect(normalizePhoneForWhatsApp('')).toBeNull();
    expect(normalizePhoneForWhatsApp(null)).toBeNull();
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
    expect(normalizePhoneForWhatsApp('12345')).toBeNull();
    expect(normalizePhoneForWhatsApp('لا يوجد')).toBeNull();
  });

  it('lets a caller override the country code (no hidden Jordan default)', () => {
    expect(normalizePhoneForWhatsApp('0791234567', '962')).toBe('962791234567');
  });

  it('builds a wa.me href with an optional prefilled message', () => {
    expect(buildWhatsAppHref('0599123456', '')).toBe('https://wa.me/970599123456');
    expect(buildWhatsAppHref('0599123456', 'تذكير بموعدك')).toBe(
      `https://wa.me/970599123456?text=${encodeURIComponent('تذكير بموعدك')}`
    );
    expect(buildWhatsAppHref('12345', 'مرحبا')).toBeNull();
    expect(buildWhatsAppHref(null, 'مرحبا')).toBeNull();
  });
});

describe('B39 — quick notes are stored, not just toggled', () => {
  const author = 'amalxraycenter@gmail.com';
  const when = '2026-09-28T12:30:45.000Z';

  it('creates the quick_notes array for a patient that had none', () => {
    const patient = { source: 'موقع الويب', status: 'جديد' };
    const next = appendQuickNote(patient, { text: 'يشكو من ألم في الفك الأيسر', date: when, by: author });

    expect(next.quick_notes).toHaveLength(1);
    expect(next.quick_notes[0]).toEqual({ text: 'يشكو من ألم في الفك الأيسر', date: when, by: author });
    // unrelated keys survive — a note must never wipe the rest of the profile
    expect(next.source).toBe('موقع الويب');
    expect(next.status).toBe('جديد');
  });

  it('prepends the newest note and keeps the previous ones in order', () => {
    const first = appendQuickNote({}, { text: 'أول ملاحظة', date: '2026-09-27T08:00:00.000Z', by: author });
    const second = appendQuickNote(first, { text: 'ثاني ملاحظة', date: when, by: author });

    expect(second.quick_notes.map((n) => n.text)).toEqual(['ثاني ملاحظة', 'أول ملاحظة']);
  });

  it('ignores blank text and never throws on malformed stored metadata', () => {
    const base = appendQuickNote({}, { text: 'ملاحظة', date: when });
    expect(appendQuickNote(base, { text: '   ', date: when }).quick_notes).toHaveLength(1);
    expect(appendQuickNote({ quick_notes: 'not-an-array' }, { text: 'نص', date: when }).quick_notes).toHaveLength(1);
    expect(appendQuickNote(null, { text: 'نص', date: when }).quick_notes).toHaveLength(1);
  });

  it('drops a duplicate entry (same text + same timestamp) and bounds history', () => {
    const note = { text: 'تكرار', date: when, by: author };
    const once = appendQuickNote({}, note);
    expect(appendQuickNote(once, note).quick_notes).toHaveLength(1);

    let bounded: unknown = {};
    for (let i = 0; i < 55; i += 1) {
      bounded = appendQuickNote(bounded, {
        text: `ملاحظة ${i}`,
        date: `2026-09-28T12:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }
    expect(parsePatientMetadata(bounded).quick_notes).toHaveLength(50);
  });

  it('round-trips through parsePatientMetadata (what the profile re-reads on refresh)', () => {
    const next = appendQuickNote({ age: '35' }, { text: 'حساسية من البنسلين', date: when, by: author });
    const parsed = parsePatientMetadata(next);

    expect(parsed.quick_notes[0].text).toBe('حساسية من البنسلين');
    expect(parsed.quick_notes[0].by).toBe(author);
    expect(parsed.age).toBe('35');
  });

  it('tolerates legacy string notes and stamps an empty date', () => {
    const parsed = parsePatientMetadata({ quick_notes: ['ملاحظة قديمة نصية'] });
    expect(parsed.quick_notes).toEqual([{ text: 'ملاحظة قديمة نصية', date: '' }]);
  });
});

/* ------------------------------------------------------------------ */
/* Source guards — the wiring that unit tests cannot render            */
/* ------------------------------------------------------------------ */

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

describe('B38/B39 — wiring guard', () => {
  const profile = read('components/dashboard/patients/SmartPatientProfile.tsx');
  const detailPage = read('app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx');
  const smartProfile = read('components/dashboard/patients/smartProfile.ts');

  it('the profile uses the shared normalizer and no longer hand-builds wa.me links', () => {
    expect(profile).toContain('normalizePhoneForWhatsApp');
    expect(profile).not.toMatch(/wa\.me\/\$\{patient\.phone/);
    expect(profile).not.toMatch(/patient\.phone\.replace/);
  });

  it('the country-code default is Palestine, never the old Jordan default', () => {
    expect(smartProfile).toContain("defaultCountryCode = '970'");
    expect(smartProfile).not.toContain("defaultCountryCode = '962'");
  });

  it('the quick-note button opens the composer instead of toggling the notes block', () => {
    expect(profile).toContain('onSaveQuickNote');
    expect(profile).toContain('setComposerOpen((v) => !v)');
    expect(profile).not.toContain('onClick={() => setNoteExpanded((v) => !v)}');
    // the composer + notes list are NOT gated on patient.notes any more
    expect(profile).toContain('composerOpen && (');
    expect(profile).toContain('quickNotes.length > 0');
  });

  it('every saved note becomes a timeline event', () => {
    expect(profile).toContain("iconType: 'note'");
    expect(profile).toContain('ملاحظات الطبيب');
  });

  it('the patient page persists notes via appendQuickNote + PUT with only quick_notes', () => {
    expect(detailPage).toContain('appendQuickNote(patient.metadata');
    expect(detailPage).toContain("method: 'PUT'");
    expect(detailPage).toContain('body: JSON.stringify({ metadata: { quick_notes: next.quick_notes } })');
    expect(detailPage).toContain('onSaveQuickNote={saveQuickNote}');
  });
});
