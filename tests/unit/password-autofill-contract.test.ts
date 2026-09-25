import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * B5 regression guard — password/email autofill contract.
 *
 * Bug (H1/H2): browsers + password managers filled the SAVED login password into
 * "current password" / "new password" / invite sign-up fields, and the login and
 * register forms had no `name` on their inputs, so managers could not tell which
 * credential a field belongs to.
 *
 * Contract:
 *   - login/register email → name="email" + autocomplete="username";
 *   - login password       → name + autocomplete="current-password";
 *   - new/confirm password → name + autocomplete="new-password" + data-lpignore
 *     (PasswordInput `ignorePasswordManagers`).
 */

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

describe('B5 — PasswordInput supports name + manager opt-out', () => {
  const component = read('components/ui/PasswordInput.tsx');

  it('accepts a name prop and forwards it to the input', () => {
    expect(component).toContain('name?: string;');
    expect(component).toMatch(/<input[\s\S]*name=\{name\}/);
  });

  it('can opt out of password-manager autofill (data-lpignore)', () => {
    expect(component).toContain('ignorePasswordManagers?: boolean;');
    expect(component).toContain("data-lpignore={ignorePasswordManagers ? 'true' : undefined}");
  });
});

describe('B5 — login page', () => {
  const login = read('app/(auth)/login/page.tsx');

  it('marks the email field as the username', () => {
    expect(login).toContain('name="email"');
    expect(login).toContain('autoComplete="username"');
  });

  it('marks the password field as the current credential', () => {
    expect(login).toContain('name="password"');
    expect(login).toContain('autoComplete="current-password"');
  });
});

describe('B5 — register page', () => {
  const register = read('app/(auth)/register/page.tsx');

  it('marks the email field as the username', () => {
    expect(register).toContain('name="email"');
    expect(register).toContain('autoComplete="username"');
  });

  it('marks both password fields as new credentials, out of autofill reach', () => {
    expect(register).toContain('name="password"');
    expect(register).toContain('name="confirm_password"');
    expect(register.match(/autoComplete="new-password"/g) ?? []).toHaveLength(2);
    expect(register.match(/ignorePasswordManagers/g) ?? []).toHaveLength(2);
  });
});

describe('B5 — dashboard profile (change password) page', () => {
  const profile = read('app/(dashboard)/dashboard/[clinicSlug]/profile/page.tsx');

  it('names the current password field so the saved login is not offered to "new"', () => {
    expect(profile).toContain('name="current_password"');
    expect(profile).toContain('autoComplete="current-password"');
  });

  it('names + protects the new/confirm password fields', () => {
    expect(profile).toContain('name="new_password"');
    expect(profile).toContain('name="confirm_password"');
    expect(profile.match(/ignorePasswordManagers/g) ?? []).toHaveLength(3);
  });
});

describe('B5 — password reset + invite sign-up pages', () => {
  const reset = read('app/(auth)/reset-password/page.tsx');
  const invite = read('app/invite/[token]/page.tsx');

  it('reset-password names both fields and blocks manager autofill', () => {
    expect(reset).toContain('name="new_password"');
    expect(reset).toContain('name="confirm_password"');
    expect(reset.match(/ignorePasswordManagers/g) ?? []).toHaveLength(2);
  });

  it('invite sign-up names its raw inputs and blocks manager autofill', () => {
    expect(invite).toContain('name="password"');
    expect(invite).toContain('name="confirm_password"');
    expect(invite.match(/autoComplete="new-password"/g) ?? []).toHaveLength(2);
    expect(invite.match(/data-lpignore="true"/g) ?? []).toHaveLength(2);
  });
});