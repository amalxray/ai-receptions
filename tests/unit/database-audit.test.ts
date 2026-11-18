import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
const migrationDir = path.join(projectRoot, 'db', 'migrations');

const migrationFiles = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql'));

describe('database migration audit', () => {
  it('keeps migrations date-named, ordered, and non-empty', () => {
    const orderedFiles = [...migrationFiles].sort();
    expect(orderedFiles.length).toBeGreaterThan(0);
    expect(new Set(orderedFiles).size).toBe(orderedFiles.length);
    for (let index = 0; index < orderedFiles.length; index += 1) {
      const file = orderedFiles[index];
      expect(file).toMatch(/^\d{8}(?:\d{6})?_[a-z0-9][a-z0-9_-]*\.sql$/i);
      expect(fs.readFileSync(path.join(migrationDir, file), 'utf8').trim()).not.toBe('');
      if (index > 0) expect(orderedFiles[index - 1] < file).toBe(true);
    }
  });

  it('ships privileged objects with explicit grants (#38 lesson)', () => {
    const permissions = fs.readFileSync(path.join(migrationDir, '20261011_permissions_and_custom_roles.sql'), 'utf8');
    expect(permissions).toContain('to service_role');
    expect(permissions).toContain('to authenticated');
    expect(permissions).toContain('grant execute on function public.set_user_permissions');
  });

  it('keeps the invitation-security functions service-role only (#38)', () => {
    const invites = fs.readFileSync(path.join(migrationDir, '20261017_invitation_security.sql'), 'utf8');

    // Every privileged function ships with explicit grants…
    expect(invites).toContain('grant execute on function public.accept_invitation(text, uuid) to service_role');
    expect(invites).toContain('grant execute on function public.expire_stale_invitations() to service_role');
    // …and `anon` can never call them straight against PostgREST.
    expect(invites).toContain('revoke all on function public.accept_invitation(text, uuid) from public, anon');
    expect(invites).toContain('revoke all on function public.open_invitation(text) from public, anon');
  });

  it('keeps core tenant indexes and trigger coverage in the production migration', () => {
    const production = fs.readFileSync(path.join(migrationDir, '20260722_production_schema.sql'), 'utf8');

    expect(production).toContain('idx_clinic_users_clinic_id');
    expect(production).toContain('idx_clinic_users_user_id');
    expect(production).toContain('idx_appointments_clinic_id_date_status');
    expect(production).toContain('idx_notifications_clinic_id');
    expect(production).toContain('set_updated_at_clinics');
    expect(production).toContain('set_updated_at_appointments');
    expect(production).toContain('set_updated_at_messages');
  });

  it('keeps appointment engine tables behind the expected RLS policy surface', () => {
    const appointmentEngine = fs.readFileSync(path.join(migrationDir, '20260723_appointment_engine.sql'), 'utf8');

    expect(appointmentEngine).toContain('ALTER TABLE public.provider_schedules ENABLE ROW LEVEL SECURITY;');
    expect(appointmentEngine).toContain('ALTER TABLE public.provider_vacations ENABLE ROW LEVEL SECURITY;');
    expect(appointmentEngine).toContain('ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;');
    expect(appointmentEngine).toContain('ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;');
    expect(appointmentEngine).toContain('CREATE POLICY provider_schedules_member_policy ON public.provider_schedules FOR ALL');
    expect(appointmentEngine).toContain('CREATE POLICY notification_queue_member_policy ON public.notification_queue FOR ALL');
  });
});
