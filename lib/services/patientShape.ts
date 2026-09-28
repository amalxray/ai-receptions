/**
 * Shared patient projection (B37).
 *
 * `GET /api/patients` (list) and `GET /api/patients/{patientId}` (single row)
 * must hand the client EXACTLY the same object shape: the patients list page and
 * the patient detail page both consume it.
 *
 * The mapper lives here instead of inside `app/api/patients/route.ts` because
 * Next.js route modules may only export HTTP handlers (plus config), so the list
 * route cannot export it for the nested `[patientId]` route to import.
 *
 * Column names differ across schema revisions (`name` vs `full_name`,
 * `phone` vs `phone_number`) and `metadata.source` / `metadata.status` are the
 * live source of truth for the Arabic labels — hence the layered fallbacks.
 */

export type ApiPatient = {
  id: string;
  clinic_id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function toPatientShape(record: any): ApiPatient {
  const source = record?.metadata?.source ?? record?.source ?? 'موقع الويب';
  const status = record?.metadata?.status ?? record?.status ?? 'جديد';
  return {
    id: record?.id ?? crypto.randomUUID(),
    clinic_id: record?.clinic_id ?? '00000000-0000-0000-0000-000000000000',
    name: record?.name ?? record?.full_name ?? 'مريض جديد',
    email: record?.email ?? '',
    phone: record?.phone ?? record?.phone_number ?? '',
    source,
    status,
    created_at: record?.created_at ?? new Date().toISOString(),
    updated_at: record?.updated_at ?? new Date().toISOString(),
    notes: record?.notes ?? null,
    metadata: record?.metadata ?? null,
  };
}
