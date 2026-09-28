import { describe, it, expect } from 'vitest';
import {
  MAX_PATIENT_AGE,
  calculateProfileCompletion,
  formatManualAgeAr,
  isValidManualAge,
  matchesProfileSearch,
  parseManualAge,
  parsePatientMetadata,
  readManualAge,
  resolvePatientAgeLabel,
  serializePatientMetadata,
} from '@/components/dashboard/patients/smartProfile';

describe('N15.1 — العمر اليدوي (manual age domain logic)', () => {
  it('parses a manually typed age and rejects everything else', () => {
    expect(parseManualAge('35')).toBe(35);
    expect(parseManualAge(' 35 ')).toBe(35);
    expect(parseManualAge(35)).toBe(35);
    expect(parseManualAge('0')).toBe(0);
    expect(parseManualAge(String(MAX_PATIENT_AGE))).toBe(MAX_PATIENT_AGE);

    expect(parseManualAge(String(MAX_PATIENT_AGE + 1))).toBeNull();
    expect(parseManualAge('-3')).toBeNull();
    expect(parseManualAge('3.5')).toBeNull();
    expect(parseManualAge('35 سنة')).toBeNull();
    expect(parseManualAge('')).toBeNull();
    expect(parseManualAge('   ')).toBeNull();
    expect(parseManualAge(null)).toBeNull();
    expect(parseManualAge(undefined)).toBeNull();
  });

  it('treats a blank age as valid input (the field is optional)', () => {
    expect(isValidManualAge('')).toBe(true);
    expect(isValidManualAge('   ')).toBe(true);
    expect(isValidManualAge('35')).toBe(true);
    expect(isValidManualAge('0')).toBe(true);

    expect(isValidManualAge('131')).toBe(false);
    expect(isValidManualAge('abc')).toBe(false);
    expect(isValidManualAge('-1')).toBe(false);
  });

  it('formats the manual age in grammatically sensible Arabic', () => {
    expect(formatManualAgeAr('35')).toBe('35 سنة');
    expect(formatManualAgeAr('5')).toBe('5 سنوات');
    expect(formatManualAgeAr('1')).toBe('سنة واحدة');
    expect(formatManualAgeAr('2')).toBe('سنتان');
    expect(formatManualAgeAr('0')).toBe('أقل من سنة');
    expect(formatManualAgeAr('')).toBe('غير محدد');
    expect(formatManualAgeAr('not-a-number')).toBe('غير محدد');
  });

  it('reads the age from flat metadata or from basic_info.age', () => {
    expect(readManualAge({ age: '42' })).toBe('42');
    expect(readManualAge({ basic_info: { age: 42 } })).toBe('42');
    // A nested value wins over the flat duplicate.
    expect(readManualAge({ age: '10', basic_info: { age: '42' } })).toBe('42');
    expect(readManualAge(null)).toBe('');
  });

  it('shows the manual age first and only falls back to a legacy birth date', () => {
    expect(resolvePatientAgeLabel({ age: '35' })).toBe('35 سنة');
    // Manual age wins even when a birth date exists on the record.
    expect(resolvePatientAgeLabel({ age: '35', date_of_birth: '1990-01-01' })).toBe('35 سنة');

    const legacy = resolvePatientAgeLabel({ date_of_birth: '1990-01-01' });
    expect(legacy).not.toBe('غير محدد');
    expect(legacy).toContain('سنة');

    expect(resolvePatientAgeLabel({})).toBe('غير محدد');
    expect(resolvePatientAgeLabel(null)).toBe('غير محدد');
  });

  it('writes the manual age flat and inside basic_info, keeping legacy keys', () => {
    const serialized = serializePatientMetadata({
      age: '35',
      date_of_birth: '1990-01-01',
      basic_info: { blood_type: 'O+', gender: 'ذكر' },
      critical_alert: 'حساسية من البنسلين',
    });

    expect(serialized.age).toBe('35');
    expect(serialized.date_of_birth).toBe('1990-01-01');
    expect(serialized.basic_info?.age).toBe('35');
    expect(serialized.basic_info?.blood_type).toBe('O+');
    expect(serialized.critical_alert).toBe('حساسية من البنسلين');
  });

  it('drops an empty age instead of storing a blank string', () => {
    const serialized = serializePatientMetadata({ age: '   ', basic_info: { blood_type: 'A+' } });
    expect(serialized.age).toBeUndefined();
    expect(serialized.basic_info?.blood_type).toBe('A+');
  });

  it('counts the manual age inside the profile completion ring', () => {
    const withoutAge = calculateProfileCompletion({ name: 'مريض تجريبي', metadata: {} });
    expect(withoutAge.missing).toContain('العمر');

    const withAge = calculateProfileCompletion({ name: 'مريض تجريبي', metadata: { age: '35' } });
    expect(withAge.missing).not.toContain('العمر');
    expect(withAge.percent).toBeGreaterThan(withoutAge.percent);

    // Legacy records that only carry a birth date still count as complete for age.
    const legacy = calculateProfileCompletion({ name: 'مريض قديم', metadata: { date_of_birth: '1990-01-01' } });
    expect(legacy.missing).not.toContain('العمر');
  });

  it('finds patients by their manually typed age', () => {
    const patient = { id: 'p1', name: 'سالم', metadata: { age: '35' } };
    expect(matchesProfileSearch('35', patient)).toBe(true);
    expect(matchesProfileSearch('99', patient)).toBe(false);
  });

  it('keeps the parsed top-level age in sync with basic_info', () => {
    const parsed = parsePatientMetadata({ age: '35' });
    expect(parsed.age).toBe('35');
    expect(parsed.basic_info.age).toBe('35');
  });
});
