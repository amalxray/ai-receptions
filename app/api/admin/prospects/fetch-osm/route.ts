import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { saveClinicsToProspects, searchClinics } from '@/lib/services/prospecting/openstreetmap';

const OSM_ERROR = 'خدمة OpenStreetMap غير متاحة حالياً. جرّب لاحقاً أو استخدم الإدخال اليدوي/CSV.';
const requestSchema = z.object({
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('PS'),
});

export const maxDuration = 45;

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('OSM request timed out')), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال JSON صالح.' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'المدينة مطلوبة، ويجب أن يكون رمز البلد من حرفين.' }, { status: 400 });
  }

  const { city, country } = parsed.data;
  let clinics;
  try {
    clinics = await withTimeout(searchClinics(city, country), 45_000);
  } catch {
    return NextResponse.json({ error: OSM_ERROR }, { status: 503 });
  }

  try {
    const saved = await saveClinicsToProspects(clinics);
    return NextResponse.json({
      found: clinics.length,
      inserted: saved.inserted,
      skipped: saved.skipped,
      city,
      country,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'تعذر حفظ نتائج OpenStreetMap.' },
      { status: 500 },
    );
  }
}
