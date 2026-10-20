import { aggregateClinicHours, toClinicWorkingHoursData } from '@/lib/services/clinicHours';
import {
  loadClinicOperatingData,
  loadClinicProfile,
  loadClinicWorkingHours,
  primeClinicChatData,
  type ClinicOperatingData,
  type ClinicProfile,
} from '@/lib/ai/clinicDataContext';
import { resolvePublicClinic, type PublicClinic } from '@/lib/services/clinics';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';

type ClinicBootstrapRow = {
  clinic: {
    id: string;
    slug: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
    city: string | null;
    area: string | null;
    address_detail: string | null;
    address: string | null;
    website: string | null;
    settings: Record<string, unknown> | null;
    activity_type: string | null;
    show_phone: boolean;
  };
  services: ClinicOperatingData['services'];
  providers: ClinicOperatingData['providers'];
  provider_service_ids: ClinicOperatingData['providerServiceIds'];
  currency: string | null;
  schedules: Array<{
    weekday: number | null;
    enabled: boolean | null;
    start_time: string | null;
    end_time: string | null;
    breaks?: unknown;
    shifts?: unknown;
    appointment_duration_minutes?: number | null;
  }>;
};

export type ClinicChatBootstrap = {
  clinic: PublicClinic;
  operatingData: ClinicOperatingData;
  profile: ClinicProfile;
  workingHours: ReturnType<typeof toClinicWorkingHoursData>;
};

/** Fetch all clinic identity and chat-operational data with one database round-trip. */
export async function loadClinicChatBootstrap(params: { id?: string; slug?: string }): Promise<ClinicChatBootstrap | null> {
  if (!params.id && !params.slug) return null;
  const { data, error } = await supabaseAdmin.rpc('get_clinic_for_chat', {
    p_slug: params.slug ?? null,
    p_clinic_id: params.id ?? null,
  });
  if (error || !data) {
    // Keep deployments functional until the additive RPC migration is applied.
    logEvent('clinic_chat_bootstrap_rpc_unavailable', {
      error: error?.message ?? 'empty_result',
    }, 'warn');
    const clinic = await resolvePublicClinic(params);
    if (!clinic) return null;
    const [operatingData, profile, workingHours] = await Promise.all([
      loadClinicOperatingData(clinic.id),
      loadClinicProfile(clinic.id),
      loadClinicWorkingHours(clinic.id),
    ]);
    primeClinicChatData({ clinicId: clinic.id, operatingData, profile, workingHours });
    return { clinic, operatingData, profile, workingHours };
  }

  const row = data as ClinicBootstrapRow;
  const rawClinic = row.clinic;
  if (!rawClinic?.id || !rawClinic.slug) return null;

  const addressBits = [rawClinic.city, rawClinic.area, rawClinic.address_detail].filter(Boolean) as string[];
  const clinic: PublicClinic = {
    id: rawClinic.id,
    slug: rawClinic.slug,
    name: rawClinic.name,
    latitude: typeof rawClinic.latitude === 'number' ? rawClinic.latitude : null,
    longitude: typeof rawClinic.longitude === 'number' ? rawClinic.longitude : null,
    address: addressBits.length ? addressBits.join(' — ') : null,
    phone: rawClinic.show_phone ? rawClinic.phone : null,
  };

  const operatingData: ClinicOperatingData = {
    services: row.services ?? [],
    providers: row.providers ?? [],
    providerServiceIds: row.provider_service_ids ?? [],
    currency: row.currency || (typeof rawClinic.settings?.currency === 'string' ? rawClinic.settings.currency : 'ils'),
    hasServices: (row.services ?? []).length > 0,
    hasProviders: (row.providers ?? []).length > 0,
    usable: (row.services ?? []).length > 0 || (row.providers ?? []).length > 0,
  };
  const profile: ClinicProfile = {
    id: rawClinic.id,
    slug: rawClinic.slug,
    name: rawClinic.name,
    address: rawClinic.address ?? null,
    phone: rawClinic.phone ?? null,
    website: rawClinic.website ?? null,
    timezone: typeof rawClinic.settings?.timezone === 'string' ? rawClinic.settings.timezone : null,
    activityType: rawClinic.activity_type ?? null,
    hasProfile: true,
  };

  const hours = aggregateClinicHours({
    id: rawClinic.id,
    slug: rawClinic.slug,
    timezone: profile.timezone,
    rows: row.schedules ?? [],
  });
  const workingHours = toClinicWorkingHoursData(hours);
  primeClinicChatData({ clinicId: rawClinic.id, operatingData, profile, workingHours });

  return { clinic, operatingData, profile, workingHours };
}
