import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneLookupVariants } from '@/lib/utils/phone';

describe('Palestinian phone normalization', () => {
  it.each([
    ['0592701077', '0592701077'],
    ['+970592701077', '0592701077'],
    ['00970592701077', '0592701077'],
    ['970592701077', '0592701077'],
    ['+970 59-270-1077', '0592701077'],
    ['+962 79 123 4567', '+962791234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('returns equivalent database lookup values for the same local number', () => {
    expect(phoneLookupVariants('0592701077')).toEqual([
      '0592701077',
      '+970592701077',
      '00970592701077',
      '970592701077',
    ]);
    expect(phoneLookupVariants('+970592701077')).toEqual(
      phoneLookupVariants('0592701077'),
    );
  });
});