import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_CATEGORIES = [
  'كهرباء',
  'ماء',
  'إيجار',
  'مستلزمات طبية',
  'صيانة',
  'نظافة',
  'إنترنت واتصالات',
  'مستلزمات مكتبية',
  'أخرى',
];

function loadEnvValue(key, fallback = '') {
  const envPath = '.env.local';
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    const match = envText.split(/\r?\n/).find((line) => line.startsWith(`${key}=`));
    if (match) return match.split('=').slice(1).join('=').trim();
  }
  return process.env[key] ?? fallback;
}

const supabaseUrl = loadEnvValue('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = loadEnvValue('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || supabaseUrl.includes('your-') || supabaseUrl.includes('placeholder')) {
  console.error('SEED EXPENSE CATEGORIES: blocked — NEXT_PUBLIC_SUPABASE_URL is missing or placeholder');
  process.exit(1);
}
if (!serviceRoleKey || serviceRoleKey.includes('your-') || serviceRoleKey.includes('placeholder')) {
  console.error('SEED EXPENSE CATEGORIES: blocked — SUPABASE_SERVICE_ROLE_KEY is missing or placeholder');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: clinics, error: clinicError } = await supabase
  .from('clinics')
  .select('id, name')
  .is('deleted_at', null);

if (clinicError) {
  console.error('Failed to fetch active clinics:', clinicError.message);
  process.exit(1);
}

if (!clinics || clinics.length === 0) {
  console.log('No active clinics found. Nothing to seed.');
  process.exit(0);
}

let inserted = 0;
let skipped = 0;

for (const clinic of clinics) {
  const rows = DEFAULT_CATEGORIES.map((name) => ({
    clinic_id: clinic.id,
    name,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('clinic_expense_categories')
    .upsert(rows, {
      onConflict: 'clinic_id,name',
      ignoreDuplicates: true,
    })
    .select('id, clinic_id, name');

  if (error) {
    console.error(`Failed to seed categories for clinic ${clinic.id}: ${error.message}`);
    continue;
  }

  const createdCount = data?.length ?? 0;
  inserted += createdCount;
  skipped += Math.max(0, DEFAULT_CATEGORIES.length - createdCount);
  console.log(`Clinic ${clinic.name ?? clinic.id}: ${createdCount} new categories ensured.`);
}

console.log(`Seed complete. Active clinics: ${clinics.length}; ensured categories: ${inserted}; duplicates ignored: ${skipped}.`);
