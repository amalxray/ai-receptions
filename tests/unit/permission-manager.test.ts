import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PERMISSIONS, ALL_PERMISSION_KEYS, ROLE_DEFAULTS } from '@/lib/auth/permissions';
import {
  PERMISSION_GROUPS,
  GROUPED_PERMISSION_KEYS,
  basePermissionsForRole,
  duplicatedGroupedPermissions,
  isCustomRoleName,
  permissionsMissingFromGroups,
  resolvePermissionState,
} from '@/lib/auth/permissionGroups';

/**
 * #43 — member permission UI contract.
 *
 * These tests exist because the page shipped BROKEN in a very specific way: the
 * component had an unused `useEffect` import, no load effect at all, and a
 * `loading` flag initialised to `true` that never cleared — so all 28 toggles
 * were hidden behind `{!loading && …}` and the save button was permanently
 * disabled. The assertions below lock down both the data contract and the
 * render-gate that broke it.
 */

const componentPath = path.resolve(__dirname, '../../components/dashboard/team/PermissionManager.tsx');
const componentSource = fs.readFileSync(componentPath, 'utf8');

describe('permission registry & display groups', () => {
  it('ships exactly the 28 permissions the UI promises', () => {
    expect(ALL_PERMISSION_KEYS).toHaveLength(28);
    expect(Object.keys(PERMISSIONS)).toHaveLength(28);
  });

  it('renders EVERY registry permission exactly once (no orphans, no duplicates)', () => {
    expect(permissionsMissingFromGroups()).toEqual([]);
    expect(duplicatedGroupedPermissions()).toEqual([]);
    expect(new Set(GROUPED_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('only groups keys that exist in the registry', () => {
    for (const [, keys] of PERMISSION_GROUPS) {
      for (const key of keys) {
        expect(ALL_PERMISSION_KEYS).toContain(key);
      }
    }
  });

  it('every group has an Arabic title and at least one permission', () => {
    for (const [title, keys] of PERMISSION_GROUPS) {
      expect(title.trim().length).toBeGreaterThan(0);
      expect(keys.length).toBeGreaterThan(0);
    }
  });
});

describe('basePermissionsForRole (mirrors the server resolution order)', () => {
  it('grants EVERYTHING to the owner, always', () => {
    const base = basePermissionsForRole('owner');
    expect(base.size).toBe(28);
    for (const key of ALL_PERMISSION_KEYS) expect(base.has(key)).toBe(true);
  });

  it('uses ROLE_DEFAULTS for each system role', () => {
    for (const role of ['manager', 'doctor', 'receptionist', 'accountant', 'staff']) {
      const base = basePermissionsForRole(role);
      expect(Array.from(base).sort()).toEqual(Array.from(ROLE_DEFAULTS[role]).sort());
    }
  });

  it('keeps staff at the single overview permission', () => {
    const base = basePermissionsForRole('staff');
    expect(base.has('view_overview')).toBe(true);
    expect(base.has('view_financial')).toBe(false);
    expect(base.size).toBe(1);
  });

  it('resolves a clinic CUSTOM role from its stored permissions, not from defaults', () => {
    const base = basePermissionsForRole('custom-secretary', [
      { name: 'custom-secretary', permissions: ['view_overview', 'manage_appointments', 'view_patients'] },
    ]);
    expect(Array.from(base).sort()).toEqual(['manage_appointments', 'view_overview', 'view_patients']);
  });

  it('never invents permissions for an unknown role (least privilege)', () => {
    expect(basePermissionsForRole('ghost-role').size).toBe(0);
    // A custom role carrying a non-array payload is ignored, not trusted.
    expect(basePermissionsForRole('broken', [{ name: 'broken', permissions: 'nope' }]).size).toBe(0);
  });

  it('identifies which role names need the custom-role lookup', () => {
    expect(isCustomRoleName('owner')).toBe(false);
    expect(isCustomRoleName('staff')).toBe(false);
    expect(isCustomRoleName('custom-secretary')).toBe(true);
  });
});

describe('resolvePermissionState (overrides on top of the base)', () => {
  const base = basePermissionsForRole('receptionist');

  it('falls back to the role base when there is no override', () => {
    const state = resolvePermissionState('view_patients', base, {});
    expect(state.enabled).toBe(true);
    expect(state.isOverride).toBe(false);
  });

  it('lets an override REVOKE a permission the role grants', () => {
    const state = resolvePermissionState('view_patients', base, { view_patients: false });
    expect(state.enabled).toBe(false);
    expect(state.isOverride).toBe(true);
  });

  it('lets an override GRANT a permission the role lacks', () => {
    const state = resolvePermissionState('manage_expenses', base, { manage_expenses: true });
    expect(state.enabled).toBe(true);
    expect(state.isOverride).toBe(true);
  });

  it('treats a falsy override value as revoked, not as "missing"', () => {
    expect(resolvePermissionState('view_overview', base, { view_overview: false }).enabled).toBe(false);
  });
});

describe('PermissionManager render contract (regression sentinel)', () => {
  it('contains the overrides-loading effect that was missing', () => {
    // The broken build had the useEffect IMPORT but zero useEffect CALLS.
    expect(componentSource).toMatch(/useEffect\(/);
    expect(componentSource).toMatch(/setLoaded\(false\)/);
    expect(componentSource).toMatch(/setLoaded\(true\)/);
  });

  it('never hides the toggles behind a loading flag', () => {
    // Toggles must render unconditionally: a stuck flag must never blank the page.
    expect(componentSource).toMatch(/PERMISSION_GROUPS\.map\(/);
    expect(componentSource).not.toMatch(/\{\s*!?loading\s*&&\s*PERMISSION_GROUPS\.map/);
    expect(componentSource).not.toMatch(/\{\s*!?loaded\s*&&\s*PERMISSION_GROUPS\.map/);
  });

  it('only gates the save button on saving/loaded (never on a flag that cannot clear)', () => {
    const disabledMatch = componentSource.match(/disabled=\{([^}]+)\}/);
    expect(disabledMatch && disabledMatch[1]).toBe('saving || !loaded');
  });

  it('fetches the member overrides and, for custom roles, the clinic roles API', () => {
    expect(componentSource).toMatch(/\/api\/clinic\/team\/\$\{[^}]+\}\/permissions\?clinic_id=/);
    expect(componentSource).toMatch(/\/api\/clinic\/roles\?clinic_id=/);
  });

  it('labels every switch from the registry, never from hard-coded strings', () => {
    expect(componentSource).toMatch(/PERMISSIONS\[key\]/);
  });
});
