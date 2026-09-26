import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { normalizeActivityType, type ActivityType } from '@/lib/services/activityTypes';

/**
 * B18 — ACTIVITY-AWARE SERVICE CATALOG (one read/write path for `/services`).
 *
 * THE BUG: the dashboard `/services` screen always wrote `clinic_services`,
 * while a tenant's public space renders the ACTIVITY-SPECIFIC catalog
 * (`imaging_services` for imaging centers, `lab_services` for dental labs —
 * `lib/services/activityPublicSpace.ts`). An imaging center therefore edited one
 * table and published another: edits never appeared, "delete" never removed the
 * public service, and new services were invisible on the site.
 *
 * THE RULE (single source of truth, `clinics.activity_type`):
 *   clinic          → clinic_services   (canonical; unchanged behaviour)
 *   imaging_center  → imaging_services  (+ mirrored into clinic_services)
 *   dental_lab      → lab_services      (+ mirrored into clinic_services)
 *
 * WHY THE MIRROR: `clinic_services` stays the CANONICAL booking/billing source
 * even for non-clinic activities — `/api/imaging/referrals` validates
 * `service_id` against the target center's `clinic_services`,
 * `/api/imaging/partner-services` (referral dropdown) reads it, and
 * `createBooking` / availability / the AI context read it. A domain row that is
 * not mirrored would be published but un-bookable and un-billable (see migration
 * `20260925000002_imaging_services_catalog_mirror.sql`). The mirror is matched
 * BY NAME, is idempotent, and only owns the fields this API writes.
 *
 * Every helper is clinic-scoped; routes call these only after authorization.
 */

export type ServiceCatalogTable = 'clinic_services' | 'imaging_services' | 'lab_services';

export type PricingType = 'unspecified' | 'fixed' | 'estimate' | 'range' | 'case_by_case';

const PRICING_TYPES: readonly PricingType[] = ['unspecified', 'fixed', 'estimate', 'range', 'case_by_case'];

export type ServiceCatalogTarget = {
  activityType: ActivityType;
  table: ServiceCatalogTable;
  /** Domain tables (imaging/lab) are mirrored into the canonical clinic_services. */
  mirrorsToCanonical: boolean;
};

/** Normalized row — the SAME shape every existing `/services` consumer expects. */
export type ServiceCatalogRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price: number | null;
  pricing_type: PricingType;
  price_min: number | null;
  price_max: number | null;
  price_visible_to_patients: boolean;
  active: boolean;
  deleted_at: string | null;
  /** Imaging-only (null elsewhere). */
  modality?: string | null;
  /** Dental-lab-only (null elsewhere). */
  turnaround_hours?: number | null;
};

export type ServiceCatalogInput = {
  name?: string;
  description?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
  pricing_type?: PricingType;
  price_min?: number | null;
  price_max?: number | null;
  price_visible_to_patients?: boolean;
  active?: boolean;
};

const CANONICAL_COLUMNS =
  'id, name, description, duration_minutes, price, pricing_type, price_min, price_max, price_visible_to_patients, active, deleted_at';
/**
 * Domain columns are deliberately PER-TABLE: `turnaround_hours` only has a
 * migration for `lab_services` (20260929), so selecting it from
 * `imaging_services` would hard-fail ("column does not exist") on a database
 * where only the migrations ran. Everything else is shared by both tables
 * (20260907_imaging_domain_booking.sql + 20260929_lab_services_pricing.sql).
 */
const IMAGING_COLUMNS =
  'id, name, description, duration_minutes, price, pricing_mode, price_min, price_max, active, deleted_at, modality';
const LAB_COLUMNS = `${IMAGING_COLUMNS}, turnaround_hours`;

function domainColumnsFor(table: 'imaging_services' | 'lab_services'): string {
  return table === 'lab_services' ? LAB_COLUMNS : IMAGING_COLUMNS;
}

function targetForActivity(activityType: ActivityType): ServiceCatalogTarget {
  switch (activityType) {
    case 'imaging_center':
      return { activityType, table: 'imaging_services', mirrorsToCanonical: true };
    case 'dental_lab':
      return { activityType, table: 'lab_services', mirrorsToCanonical: true };
    default:
      return { activityType: 'clinic', table: 'clinic_services', mirrorsToCanonical: false };
  }
}

function normalizePricingType(value: unknown): PricingType {
  return typeof value === 'string' && (PRICING_TYPES as readonly string[]).includes(value)
    ? (value as PricingType)
    : 'unspecified';
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The domain catalogs use INTEGER columns for price/duration (whole shekels),
 * while the clinic form submits raw numbers. Rounding keeps a decimal input from
 * turning into a 500 ("invalid input syntax for type integer").
 */
function toIntOrNull(value: unknown): number | null {
  const n = toNumberOrNull(value);
  return n === null ? null : Math.round(n);
}

/**
 * Resolves WHICH catalog a tenant owns. Fail-safe: if the activity type cannot
 * be read for any reason, the canonical table is used (the historical behaviour)
 * and the failure is logged — a lookup problem must never block the owner's save.
 */
export async function resolveServiceCatalogTarget(clinicId: string): Promise<ServiceCatalogTarget> {
  try {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('activity_type')
      .eq('id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const raw = (data as { activity_type?: string } | null)?.activity_type ?? 'clinic';
    return targetForActivity(normalizeActivityType(raw));
  } catch (err) {
    logEvent(
      'service_catalog_activity_lookup_failed',
      { clinic_id: clinicId, error: err instanceof Error ? err.message : String(err) },
      'error'
    );
    return targetForActivity('clinic');
  }
}

function normalizeCanonicalRow(row: Record<string, unknown>): ServiceCatalogRow {
  const deletedAt = (row.deleted_at as string | null) ?? null;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    duration_minutes: toNumberOrNull(row.duration_minutes),
    price: toNumberOrNull(row.price),
    pricing_type: normalizePricingType(row.pricing_type),
    price_min: toNumberOrNull(row.price_min),
    price_max: toNumberOrNull(row.price_max),
    price_visible_to_patients: row.price_visible_to_patients !== false,
    active: row.active !== false && !deletedAt,
    deleted_at: deletedAt,
  };
}

function normalizeDomainRow(row: Record<string, unknown>): ServiceCatalogRow {
  const deletedAt = (row.deleted_at as string | null) ?? null;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    duration_minutes: toNumberOrNull(row.duration_minutes),
    price: toNumberOrNull(row.price),
    pricing_type: normalizePricingType(row.pricing_mode),
    price_min: toNumberOrNull(row.price_min),
    price_max: toNumberOrNull(row.price_max),
    // Domain catalogs have no per-service visibility column: prices are already
    // gated at the profile level (public_profile.show_prices) by the public space.
    price_visible_to_patients: true,
    active: row.active !== false && !deletedAt,
    deleted_at: deletedAt,
    modality: (row.modality as string | null) ?? null,
    turnaround_hours: toNumberOrNull(row.turnaround_hours),
  };
}

function normalizeRow(table: ServiceCatalogTable, row: Record<string, unknown>): ServiceCatalogRow {
  return table === 'clinic_services' ? normalizeCanonicalRow(row) : normalizeDomainRow(row);
}

/** All catalog rows for a tenant — INCLUDING inactive ones (the UI shows them as Inactive). */
export async function listCatalogServices(clinicId: string): Promise<ServiceCatalogRow[]> {
  const { table } = await resolveServiceCatalogTarget(clinicId);
  const query = supabaseAdmin
    .from(table)
    .select(table === 'clinic_services' ? CANONICAL_COLUMNS : domainColumnsFor(table))
    .eq('clinic_id', clinicId);

  // Domain catalogs: a soft-deleted row is GONE for the owner (Delete means
  // delete), while an `active=false` row still shows as Inactive. The canonical
  // table keeps its historical contract (soft-deleted rows stay visible).
  const filtered = table === 'clinic_services' ? query : query.is('deleted_at', null);
  const { data, error } = await filtered.order('name', { ascending: true });
  if (error) throw new Error(error.message);
  // `unknown` hop: the projected columns are chosen at runtime (a union of two
  // literal strings), so supabase-js types `data` as a query-parser error rather
  // than a row shape. Same convention as `activityPublicSpace.ts`.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => normalizeRow(table, row));
}

async function findCanonicalByName(clinicId: string, name: string): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('clinic_services')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('name', name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null) ?? null;
}

/**
 * Keeps the canonical `clinic_services` row in sync with a domain row so
 * booking / referrals / billing / AI keep seeing the service. Best-effort by
 * design: the domain row (the public surface) is already written, so a mirror
 * failure is logged loudly instead of failing the owner's save.
 */
async function syncCanonicalMirror(
  clinicId: string,
  row: ServiceCatalogRow,
  previousName: string | null
): Promise<void> {
  try {
    const lookupName = previousName ?? row.name;
    const payload: Record<string, unknown> = {
      clinic_id: clinicId,
      name: row.name,
      description: row.description,
      // clinic_services.duration_minutes is NOT NULL DEFAULT 30.
      duration_minutes: row.duration_minutes ?? 30,
      price: row.price,
      pricing_type: row.pricing_type ?? 'unspecified',
      price_min: row.price_min,
      price_max: row.price_max,
      price_visible_to_patients: row.price_visible_to_patients ?? true,
      active: row.active,
      deleted_at: null,
    };

    const existing = await findCanonicalByName(clinicId, lookupName);
    if (existing) {
      const { error } = await supabaseAdmin
        .from('clinic_services')
        .update(payload)
        .eq('id', existing.id)
        .eq('clinic_id', clinicId);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabaseAdmin.from('clinic_services').insert(payload);
    if (error) throw new Error(error.message);
  } catch (err) {
    logEvent(
      'service_catalog_mirror_failed',
      { clinic_id: clinicId, name: row.name, error: err instanceof Error ? err.message : String(err) },
      'error'
    );
  }
}

async function findDomainRowByName(
  clinicId: string,
  table: 'imaging_services' | 'lab_services',
  name: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('name', name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string } | null) ?? null;
}

export async function createCatalogService(
  clinicId: string,
  input: ServiceCatalogInput
): Promise<ServiceCatalogRow> {
  const target = await resolveServiceCatalogTarget(clinicId);
  const name = (input.name ?? '').trim();
  const pricingType = input.pricing_type ?? 'unspecified';
  const price = toNumberOrNull(input.price);
  const priceVisible = input.price_visible_to_patients ?? true;
  const active = input.active ?? true;
  const durationMinutes = toNumberOrNull(input.duration_minutes);

  if (target.table === 'clinic_services') {
    const { data, error } = await supabaseAdmin
      .from('clinic_services')
      .insert({
        clinic_id: clinicId,
        name,
        description: input.description ?? null,
        duration_minutes: durationMinutes,
        price,
        pricing_type: pricingType,
        price_min: toNumberOrNull(input.price_min),
        price_max: toNumberOrNull(input.price_max),
        price_visible_to_patients: priceVisible,
        active,
        deleted_at: null,
      })
      .select(CANONICAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return normalizeCanonicalRow(data as Record<string, unknown>);
  }

  // Domain catalog (imaging_services | lab_services) — the owner-facing AND the
  // public source of truth for this activity.
  const table = target.table;
  const domainPayload: Record<string, unknown> = {
    clinic_id: clinicId,
    name,
    description: input.description ?? null,
    duration_minutes: toIntOrNull(durationMinutes),
    price: toIntOrNull(price),
    // The public imaging price label is driven by pricing_mode: a fixed price
    // must be announced as 'fixed', otherwise the site renders no price at all.
    pricing_mode: pricingType !== 'unspecified' ? pricingType : price !== null ? 'fixed' : 'unspecified',
    price_min: toIntOrNull(input.price_min),
    price_max: toIntOrNull(input.price_max),
    active,
    deleted_at: null,
  };

  // A soft-deleted row with the same name still occupies the unique
  // (clinic_id, name) index → revive it instead of failing the insert.
  const existingDomainRow = await findDomainRowByName(clinicId, table, name);
  const write = existingDomainRow
    ? supabaseAdmin.from(table).update(domainPayload).eq('id', existingDomainRow.id).eq('clinic_id', clinicId)
    : supabaseAdmin.from(table).insert(domainPayload);
  const { data, error } = await write.select(domainColumnsFor(table)).single();
  if (error) throw new Error(error.message);

  const row = normalizeDomainRow(data as unknown as Record<string, unknown>);
  await syncCanonicalMirror(clinicId, row, existingDomainRow ? existingDomainRow.name : null);
  return row;
}

export async function updateCatalogService(
  clinicId: string,
  serviceId: string,
  input: ServiceCatalogInput
): Promise<ServiceCatalogRow | null> {
  const target = await resolveServiceCatalogTarget(clinicId);

  if (target.table === 'clinic_services') {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.duration_minutes !== undefined) update.duration_minutes = toNumberOrNull(input.duration_minutes);
    if (input.price !== undefined) update.price = toNumberOrNull(input.price);
    if (input.pricing_type !== undefined) update.pricing_type = input.pricing_type;
    if (input.price_min !== undefined) update.price_min = toNumberOrNull(input.price_min);
    if (input.price_max !== undefined) update.price_max = toNumberOrNull(input.price_max);
    if (input.price_visible_to_patients !== undefined) update.price_visible_to_patients = input.price_visible_to_patients;
    if (input.active !== undefined) update.active = input.active;

    const { data, error } = await supabaseAdmin
      .from('clinic_services')
      .update(update)
      .eq('id', serviceId)
      .eq('clinic_id', clinicId)
      .select('id, name, description, duration_minutes, price, active, deleted_at')
      .single();
    if (error) throw new Error(error.message);
    return normalizeCanonicalRow(data as Record<string, unknown>);
  }

  const table = target.table;
  const { data: current, error: currentError } = await supabaseAdmin
    .from(table)
    .select('id, name')
    .eq('id', serviceId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) return null;
  const currentRow = current as { id: string; name: string };

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.description !== undefined) update.description = input.description;
  if (input.duration_minutes !== undefined) update.duration_minutes = toIntOrNull(input.duration_minutes);
  if (input.price !== undefined) {
    const price = toIntOrNull(input.price);
    update.price = price;
    // Keep the public price label honest: a price without a mode is invisible.
    update.pricing_mode = input.pricing_type ?? (price !== null ? 'fixed' : 'unspecified');
  } else if (input.pricing_type !== undefined) {
    update.pricing_mode = input.pricing_type;
  }
  if (input.price_min !== undefined) update.price_min = toIntOrNull(input.price_min);
  if (input.price_max !== undefined) update.price_max = toIntOrNull(input.price_max);
  if (input.active !== undefined) update.active = input.active;

  const { data, error } = await supabaseAdmin
    .from(table)
    .update(update)
    .eq('id', serviceId)
    .eq('clinic_id', clinicId)
    .select(domainColumnsFor(table))
    .single();
  if (error) {
    // Unique (clinic_id, name) — the owner renamed onto an existing service.
    if ((error as { code?: string }).code === '23505') throw new Error('SERVICE_NAME_TAKEN');
    throw new Error(error.message);
  }

  const row = normalizeDomainRow(data as unknown as Record<string, unknown>);
  await syncCanonicalMirror(clinicId, row, currentRow.name);
  return row;
}

export async function deleteCatalogService(clinicId: string, serviceId: string): Promise<boolean> {
  const target = await resolveServiceCatalogTarget(clinicId);
  const now = new Date().toISOString();

  if (target.table === 'clinic_services') {
    const { error } = await supabaseAdmin
      .from('clinic_services')
      .update({ deleted_at: now, active: false })
      .eq('id', serviceId)
      .eq('clinic_id', clinicId);
    if (error) throw new Error(error.message);
    return true;
  }

  const table = target.table;
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ deleted_at: now, active: false })
    .eq('id', serviceId)
    .eq('clinic_id', clinicId)
    .select('id, name')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const deletedName = String((data as { name: string }).name);

  // The canonical mirror must disappear too, otherwise the deleted service would
  // stay bookable / referable forever.
  try {
    const { error: mirrorError } = await supabaseAdmin
      .from('clinic_services')
      .update({ deleted_at: now, active: false })
      .eq('clinic_id', clinicId)
      .eq('name', deletedName)
      .is('deleted_at', null);
    if (mirrorError) throw new Error(mirrorError.message);
  } catch (err) {
    logEvent(
      'service_catalog_mirror_delete_failed',
      { clinic_id: clinicId, name: deletedName, error: err instanceof Error ? err.message : String(err) },
      'error'
    );
  }

  return true;
}
