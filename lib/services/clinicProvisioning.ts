/**
 * Tenant provisioning state — persisted INSIDE `clinics.settings` (jsonb).
 *
 * Why `settings` and not dedicated columns: the live database has no
 * `subdomain` / `clinic_email` columns and the Supabase access token needed
 * for DDL is expired; `settings` already exists, is merged (never replaced)
 * by every writer (see clinicPublicConfig) and needs zero migration. The
 * shape lives under `settings.tenant` so it cannot collide with existing keys.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ClinicTenantProvisioning = {
  /** Fully-qualified host, e.g. `hala-clinic.dentairec.com`. */
  subdomain?: string;
  subdomain_status?: 'active' | 'failed';
  subdomain_error?: string;
  /** Full mailbox, e.g. `hala@dentairec.com`. */
  mailbox?: string;
  mailbox_status?: 'active' | 'needs_verification' | 'failed';
  mailbox_error?: string;
  provisioned_at?: string;
};

export const SETTINGS_TENANT_KEY = 'tenant';

/**
 * Read-modify-write of `settings.tenant`. Returns false on any failure —
 * callers treat provisioning persistence as best-effort and must never let it
 * break the main flow (registration / onboarding).
 */
export async function persistClinicProvisioning(
  clinicId: string,
  patch: ClinicTenantProvisioning
): Promise<boolean> {
  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from('clinics')
      .select('settings')
      .eq('id', clinicId)
      .maybeSingle();
    if (readError || !row) return false;

    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const tenant: ClinicTenantProvisioning = {
      ...((settings[SETTINGS_TENANT_KEY] as ClinicTenantProvisioning | undefined) ?? {}),
      ...patch,
      provisioned_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('clinics')
      .update({ settings: { ...settings, [SETTINGS_TENANT_KEY]: tenant } })
      .eq('id', clinicId);
    return !updateError;
  } catch {
    return false;
  }
}

/** Reads the persisted tenant state (undefined when none / on any failure). */
export async function getClinicProvisioning(
  clinicId: string
): Promise<ClinicTenantProvisioning | undefined> {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('clinics')
      .select('settings')
      .eq('id', clinicId)
      .maybeSingle();
    if (error || !row) return undefined;
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    return settings[SETTINGS_TENANT_KEY] as ClinicTenantProvisioning | undefined;
  } catch {
    return undefined;
  }
}
