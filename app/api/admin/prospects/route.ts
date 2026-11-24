import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().optional(),
);

const createProspectSchema = z.object({
  clinic_name: z.string().trim().min(2).max(200),
  doctor_name: optionalText,
  phone: optionalText,
  email: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().email().optional(),
  ),
  website: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().url().optional(),
  ),
  address: optionalText,
  city: z.string().trim().min(1),
  country: z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? 'PS' : value),
    z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('PS'),
  ),
  notes: optionalText,
});

const deleteProspectSchema = z.object({
  id: z.string().uuid(),
});

const PROSPECT_STATUSES = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'converted',
  'rejected',
  'archived',
] as const;

export async function GET(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status')?.trim();
  const city = url.searchParams.get('city')?.trim();
  if (status && !PROSPECT_STATUSES.includes(status as (typeof PROSPECT_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid prospect status.' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('prospects')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  if (city) query = query.eq('city', city);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      prospects: data ?? [],
      total: count ?? 0,
    },
  });
}

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = createProspectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid prospect details.', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .insert({
      ...parsed.data,
      source: 'manual',
      source_id: null,
      status: 'new',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = deleteProspectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid prospect ID is required.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('prospects')
    .update({ status: 'archived' })
    .eq('id', parsed.data.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Prospect not found.' }, { status: 404 });
  }

  return NextResponse.json({ data });
}
