import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../db/migrations/20261026_subscription_freeze.sql', import.meta.url),
  'utf8',
);

describe('subscription freeze migration', () => {
  it('freezes only after period end and blocks new clinic records and uploads', () => {
    expect(migration).toMatch(/subscription_status in \('active', 'cancelled', 'frozen'\)/);
    expect(migration).toMatch(/before insert on public\.appointments/i);
    expect(migration).toMatch(/before insert on public\.patients/i);
    expect(migration).toMatch(/before insert on storage\.objects/i);
    expect(migration).toMatch(/new\.current_period_end <= clock_timestamp\(\)/i);
    expect(migration).toMatch(/set subscription_status = 'frozen'/i);
  });
});
