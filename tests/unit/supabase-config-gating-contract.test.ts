import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * B4 regression guard — "Supabase is not configured" must only ever be claimed
 * when the health-check ACTUALLY answered `isConfigured: false`.
 *
 * Bug: `if (!isSupabaseConfigured)` ran while the check was still in flight
 * (and also when the check itself failed), so an in-progress or errored health
 * check was reported to the user as a misconfigured backend.
 *
 * Fix: gated on the hook's real state — `loading` → skeleton, and the
 * "not configured" message only when `!isConfigured && !checkFailed`.
 */

const projectRoot = path.resolve(__dirname, '../..');

const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

/** Files that render the "backend not configured" state. */
const GATED_FILES = [
  'components/dashboard/clinic/ClinicSetupManager.tsx',
  'components/dashboard/clinic/ProviderScheduleManager.tsx',
  'components/dashboard/clinic/ProviderServiceManager.tsx',
  'components/dashboard/NotificationTemplateManager.tsx',
  'components/dashboard/clinic/PublicPresenceManager.tsx',
  'components/dashboard/clinic/PublicPageManager.tsx',
  'components/dashboard/clinic/PublicPageContentManager.tsx',
  'components/dashboard/clinic/ActivityOperations.tsx',
  'app/(dashboard)/dashboard/[clinicSlug]/overview/page.tsx',
  'app/(dashboard)/dashboard/[clinicSlug]/ai-settings/page.tsx',
  'app/(dashboard)/dashboard/[clinicSlug]/ads/page.tsx',
  'app/(dashboard)/dashboard/[clinicSlug]/knowledge-base/page.tsx',
];

/** Lines that tell the user the backend is missing. */
const NOT_CONFIGURED_MARKERS = [
  'Supabase is not configured',
  'قاعدة البيانات غير مهيأة',
];

describe('B4 — the hook exposes the real health-check state', () => {
  const hook = read('lib/useSupabaseConfig.ts');

  it('exposes loading + checkFailed so callers can tell "unknown" from "off"', () => {
    expect(hook).toContain('loading: boolean');
    expect(hook).toContain('checkFailed: boolean');
    expect(hook).toContain('checkFailed: false');
    // A failed fetch sets checkFailed, never a false "not configured".
    expect(hook).toMatch(/catch[\s\S]*checkFailed: true/);
  });
});

describe('B4 — .tsx consumers only claim "not configured" after a real answer', () => {
  for (const rel of GATED_FILES) {
    it(`${rel} gates the message on checkFailed`, () => {
      const content = read(rel);
      expect(content).toContain('checkFailed');

      const lines = content.split('\n');
      for (const marker of NOT_CONFIGURED_MARKERS) {
        lines.forEach((line, i) => {
          if (!line.includes(marker)) return;
          // The guard is a JSX conditional one line above the <EmptyState …>,
          // so require checkFailed in the enclosing few lines.
          const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
          expect(window).toContain('checkFailed');
        });
      }
    });
  }

  for (const rel of [
    'components/dashboard/clinic/ClinicSetupManager.tsx',
    'components/dashboard/clinic/ProviderScheduleManager.tsx',
    'components/dashboard/clinic/ProviderServiceManager.tsx',
    'components/dashboard/NotificationTemplateManager.tsx',
  ]) {
    it(`${rel} shows a skeleton while the health-check is in flight`, () => {
      const content = read(rel);
      expect(content).toMatch(/loading: configLoading/);
      expect(content).toMatch(/if \(loading \|\| configLoading\) return <Skeleton/);
      expect(content).toContain('setError(null)');
    });
  }
});