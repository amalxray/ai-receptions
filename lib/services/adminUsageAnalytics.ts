import { supabaseAdmin } from '@/lib/supabase/admin';

const PAGE_SIZE = 1000;

type ClinicRow = {
  id: string;
  name: string;
  slug: string;
};

type ClinicUsageRow = {
  clinic_id: string;
  clinic_name: string;
  clinic_slug: string;
  patient_count: number;
  appointment_count: number;
  ai_message_count: number;
};

type ClinicIdRow = { clinic_id: string };

function tallyClinicRows(rows: ClinicIdRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.clinic_id, (totals.get(row.clinic_id) ?? 0) + 1);
  return totals;
}

async function loadClinicIds(
  table: 'patients' | 'appointments' | 'messages',
  role?: string,
): Promise<ClinicIdRow[]> {
  const rows: ClinicIdRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabaseAdmin
      .from(table)
      .select('clinic_id')
      .is('deleted_at', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) throw new Error(`Unable to load ${table} usage`);

    const page = (data ?? []) as ClinicIdRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function summarizeClinicUsage(
  clinics: ClinicRow[],
  patients: ClinicIdRow[],
  appointments: ClinicIdRow[],
  aiMessages: ClinicIdRow[],
): ClinicUsageRow[] {
  const patientCounts = tallyClinicRows(patients);
  const appointmentCounts = tallyClinicRows(appointments);
  const aiMessageCounts = tallyClinicRows(aiMessages);

  return clinics.map((clinic) => ({
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    clinic_slug: clinic.slug,
    patient_count: patientCounts.get(clinic.id) ?? 0,
    appointment_count: appointmentCounts.get(clinic.id) ?? 0,
    ai_message_count: aiMessageCounts.get(clinic.id) ?? 0,
  }));
}

export async function getAdminUsageAnalytics(): Promise<ClinicUsageRow[]> {
  const [clinicsResult, patients, appointments, aiMessages] = await Promise.all([
    supabaseAdmin.from('clinics').select('id, name, slug').is('deleted_at', null),
    loadClinicIds('patients'),
    loadClinicIds('appointments'),
    loadClinicIds('messages', 'assistant'),
  ]);
  if (clinicsResult.error) throw new Error('Unable to load clinics for usage analytics');

  return summarizeClinicUsage(
    (clinicsResult.data ?? []) as ClinicRow[],
    patients,
    appointments,
    aiMessages,
  );
}
