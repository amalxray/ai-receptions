import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Clinic } from '@/types/clinic';

/**
 * Public-safe clinic shape returned by resolvePublicClinic.
 * Only contains fields safe to expose to the public booking portal.
 */
export type PublicClinic = {
  id: string;
  slug: string;
  name: string;
  /** Location (booking success directions card) — null when not set by the owner. */
  latitude: number | null;
  longitude: number | null;
  /** Public display address (city/area/address_detail joined) — null when unset. */
  address: string | null;
  /** Phone shown only when the owner enabled show_phone on the public profile. */
  phone: string | null;
};

export async function getActiveClinic(userId: string): Promise<Clinic | null> {
  // For now, the "active" clinic is the first one the user is a member of.
  // This could be extended to support a "last used" or "preferred" clinic.
  const { data: clinicUserData, error: clinicUserError } = await supabaseAdmin
    .from('clinic_users')
    .select('clinic_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (clinicUserError || !clinicUserData) {
    return null;
  }

  return getClinicById(clinicUserData.clinic_id);
}

export async function getClinicById(id: string): Promise<Clinic | null> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Clinic | null;
}

/**
 * Resolves a clinic for the public booking portal.
 *
 * Accepts either a clinic id (uuid) or a public slug.
 * Only returns clinics that exist and are not soft-deleted.
 * Returns null when:
 *   - no identifier is provided
 *   - the clinic does not exist
 *   - the clinic is inactive (deleted_at is set)
 *
 * Never falls back to a fake/default clinic — the caller must handle
 * the null case by showing a clinic-not-found state.
 */
export async function resolvePublicClinic(params: { id?: string; publicId?: string; slug?: string }): Promise<PublicClinic | null> {
  if (!params.id && !params.publicId && !params.slug) {
    return null;
  }

  let query = supabaseAdmin
    .from('clinics')
    .select('id, slug, name, latitude, longitude, phone, city, area, address_detail, settings')
    .is('deleted_at', null);

  if (params.id) {
    query = query.eq('id', params.id);
  } else if (params.publicId) {
    query = query.eq('public_id', params.publicId);
  } else {
    query = query.eq('slug', params.slug);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  // Phone stays private unless the owner enabled show_phone on the public
  // profile (same gating as the public space).
  const pp = ((data.settings as Record<string, unknown> | null)?.public_profile ?? {}) as {
    show_phone?: unknown;
  };
  const showPhone = pp.show_phone === true;

  const addressBits = [data.city, data.area, data.address_detail].filter(Boolean) as string[];

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    address: addressBits.length > 0 ? addressBits.join(' — ') : null,
    phone: showPhone ? (data.phone ?? null) : null,
  };
}

export async function createClinic(clinic: Omit<Clinic, 'id' | 'created_at'>): Promise<Clinic> {
  const { data, error } = await supabaseAdmin.from('clinics').insert([clinic]).select().single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Clinic;
}