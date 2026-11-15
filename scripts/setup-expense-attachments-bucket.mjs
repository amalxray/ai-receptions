import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function normalizeEnvValue(value = '') {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function loadEnvValue(key, fallback = '') {
  const envPath = process.env.SEED_ENV_FILE || '.env.local';
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    const match = lines.find((line) => line.startsWith(`${key}=`));
    if (match) return normalizeEnvValue(match.split('=').slice(1).join('='));
  }
  return normalizeEnvValue(process.env[key] ?? fallback);
}

const supabaseUrl = loadEnvValue('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = loadEnvValue('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || supabaseUrl.includes('your-') || supabaseUrl.includes('placeholder')) {
  console.error('Expense attachment bucket setup blocked — NEXT_PUBLIC_SUPABASE_URL missing or invalid.');
  process.exit(1);
}
if (!serviceRoleKey || serviceRoleKey.includes('your-') || serviceRoleKey.includes('placeholder')) {
  console.error('Expense attachment bucket setup blocked — SUPABASE_SERVICE_ROLE_KEY missing or invalid.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error('Unable to read storage buckets:', listError.message);
  process.exit(1);
}

const bucket = existingBuckets?.find((entry) => entry.id === 'expense-attachments');
if (bucket) {
  const { error: updateError } = await supabase.storage.updateBucket('expense-attachments', {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  });
  if (updateError) {
    console.error('Unable to enforce private bucket settings:', updateError.message);
    process.exit(1);
  }
  console.log("Bucket 'expense-attachments' is configured as private.");
  process.exit(0);
}

const { data, error } = await supabase.storage.createBucket('expense-attachments', {
  public: false,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
});

if (error) {
  console.error('Failed to create expense-attachments bucket:', error.message);
  process.exit(1);
}

console.log(`Created bucket 'expense-attachments'.`, data ? JSON.stringify(data) : '');
