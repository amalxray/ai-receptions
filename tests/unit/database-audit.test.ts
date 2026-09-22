import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
const migrationDir = path.join(projectRoot, 'db', 'migrations');

const migrationFiles = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

describe('database migration audit', () => {
  it('keeps the migration sequence ordered by phase', () => {
    expect(migrationFiles).toEqual([
      '20260721_initial_schema.sql',
      '20260722_ai_core_schema.sql',
      '20260722_production_schema.sql',
      '20260723000001_communication_gateway.sql',
      '20260723000002_conversation_intelligence.sql',
      '20260723_appointment_engine.sql',
      '20260724_communication_gateway.sql',
      '20260725_knowledge_documents.sql',
      '20260726_vector_search.sql',
      '20260727_usage_tracking_enhancements.sql',
      '20260728_conversation_intelligence.sql',
      '20260729_schema_reconciliation.sql',
      '20260809_booking_service_catalog.sql',
      '20260810_booking_confirmation_tokens.sql',
      '20260811_booking_communications.sql',
      '20260812_clinic_communication_settings.sql',
      '20260813_provider_schedule_assignment.sql',
      '20260814_booking_race_condition_fix.sql',
      '20260815_notification_templates_and_reminder_config.sql',
      '20260816_fix_recursive_rls.sql',
      '20260820_clinic_ads_table.sql',
      '20260821_founding_member_clinics.sql',
      '20260827_dashboard_location_roles_shifts.sql',
      '20260830_billing_plans.sql',
      '20260831_entitlement_usage.sql',
      '20260832_clinic_public_id.sql',
      '20260833_clinic_ads_fix.sql',
      '20260834_subscription_write_service_only.sql',
      '20260835_clinic_ai_settings_policy_safe.sql',
      '20260836_billing_plans_limits_canonical.sql',
      '20260901_accounting_phase_a.sql',
      '20260902_accounting_phase_b.sql',
      '20260903_accounting_phase_c.sql',
      '20260904_localization_foundation.sql',
      '20260905_insurance_foundation.sql',
      '20260906_payroll_foundation.sql',
      '20260907_financial_reporting.sql',
      '20260908_growth_layer.sql',
      '20260909_patient_portal_identity.sql',
      '20260910_portal_payments.sql',
      '20260911_portal_refunds.sql',
      '20260912_platform_admins.sql',
      '20260912_provider_public_visibility.sql',
      '20260913_provider_public_profile.sql',
      '20260914_digital_healthcare_space.sql',
      '20260916_phase1_entitlements_workflows.sql',
      '20260917_phase1b_workflow_transitions.sql',
      '20260918_phase2_smart_booking.sql',
      '20260919_phase3_recall_notifications.sql',
      '20260920_phase4_digital_intake.sql',
      '20260921_clinic_public_media.sql',
      '20260921_subscription_foundation_fixes.sql',
      '20260922_clinic_public_media_category.sql',
      '20260922_cross_tenant_coordination.sql',
      '20260922_subscription_v2_migration.sql',
      '20260923_clinic_before_after.sql',
      '20260923_medical_files_scale.sql',
      '20260924_clinic_badges.sql',
      '20260924_imaging_requests_billing_link.sql',
      '20260925_imaging_services_catalog_mirror.sql',
      '20260925_patients_email_nullable.sql',
      '20260925_security_definer_views.sql',
      '20260926_clinic_messaging.sql',
      '20260926_imaging_requests_center_patient.sql',
      '20260927_patient_unified_indexes.sql',
      '20260928_public_page_content.sql',
      '20260929_lab_services_pricing.sql',
      '20261001_landing_page_content.sql',
      '20261002_payments_status_sync.sql',
      '20261003_notification_type_announcement.sql',
      '20261004_email_field_content_grants.sql',
      '20261005_clinic_location.sql',
      '20261006_platform_admins_grant.sql',
      '20261007_ask_platform.sql',
      '20261008_ask_nearby_rpc.sql',
      '20261009_invoice_slug_numbering.sql',
      '20261010_clinic_invitations.sql',
      '20261011_permissions_and_custom_roles.sql',
      '20261012_payroll_engine.sql',
      '20261013_lahza_gateway.sql',
      '20261014_set_user_permissions_actor.sql',
      '20261015_fix_set_user_permissions.sql',
    ]);
    // Sorting is part of the contract: pg/CI apply migrations in lexical order.
    expect([...migrationFiles]).toEqual([...migrationFiles].sort());
    expect(new Set(migrationFiles).size).toBe(migrationFiles.length);
  });

  it('ships privileged objects with explicit grants (#38 lesson)', () => {
    const permissions = fs.readFileSync(path.join(migrationDir, '20261011_permissions_and_custom_roles.sql'), 'utf8');
    expect(permissions).toContain('to service_role');
    expect(permissions).toContain('to authenticated');
    expect(permissions).toContain('grant execute on function public.set_user_permissions');
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
