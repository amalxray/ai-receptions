import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().optional(),
);

const prospectSchema = z.object({
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

type ProspectField = keyof z.infer<typeof prospectSchema>;

const HEADER_ALIASES: Record<ProspectField, string[]> = {
  clinic_name: ['clinic_name', 'clinic name', 'name', 'اسم العيادة', 'اسم العياده', 'العيادة', 'العياده'],
  doctor_name: ['doctor_name', 'doctor name', 'doctor', 'اسم الطبيب', 'الطبيب'],
  phone: ['phone', 'telephone', 'mobile', 'الهاتف', 'رقم الهاتف', 'الجوال'],
  email: ['email', 'e-mail', 'البريد', 'البريد الإلكتروني', 'البريد الالكتروني'],
  website: ['website', 'web site', 'url', 'الموقع', 'الموقع الإلكتروني', 'الموقع الالكتروني'],
  address: ['address', 'العنوان'],
  city: ['city', 'المدينة'],
  country: ['country', 'الدولة', 'البلد'],
  notes: ['notes', 'note', 'ملاحظات', 'ملاحظة'],
};

const REQUIRED_FIELDS: ProspectField[] = ['clinic_name', 'city'];
const MAX_ROWS = 500;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error('الملف يحتوي على اقتباس غير مغلق.');

  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ''));
}

function getHeaderMap(headers: string[]) {
  const aliases = new Map<string, ProspectField>();
  for (const [field, names] of Object.entries(HEADER_ALIASES) as [ProspectField, string[]][]) {
    for (const name of names) aliases.set(normalizeHeader(name), field);
  }

  return headers.reduce<Partial<Record<ProspectField, number>>>((map, header, index) => {
    const field = aliases.get(normalizeHeader(header));
    if (field && map[field] === undefined) map[field] = index;
    return map;
  }, {});
}

function rowValue(row: string[], headerMap: Partial<Record<ProspectField, number>>, field: ProspectField) {
  const index = headerMap[field];
  return index === undefined ? undefined : row[index]?.trim() ?? '';
}

function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`)
    .join('؛ ');
}

export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'يجب إرسال الملف بصيغة multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'يرجى اختيار ملف CSV.' }, { status: 400 });
  }
  if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'يسمح بملفات CSV فقط.' }, { status: 400 });
  }

  let rows: string[][];
  try {
    rows = parseCsv(await file.text());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'تعذر تحليل ملف CSV.' },
      { status: 400 },
    );
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: 'يجب أن يحتوي الملف على صف عناوين وصف بيانات واحد على الأقل.' }, { status: 400 });
  }

  const headerMap = getHeaderMap(rows[0]);
  const missingHeaders = REQUIRED_FIELDS.filter((field) => headerMap[field] === undefined);
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `الأعمدة المطلوبة مفقودة: ${missingHeaders.join(', ')}` },
      { status: 400 },
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return NextResponse.json({ error: `الحد الأقصى للاستيراد هو ${MAX_ROWS} صفاً.` }, { status: 400 });
  }

  const validRows: Record<string, unknown>[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const candidate = {
      clinic_name: rowValue(row, headerMap, 'clinic_name'),
      doctor_name: rowValue(row, headerMap, 'doctor_name'),
      phone: rowValue(row, headerMap, 'phone'),
      email: rowValue(row, headerMap, 'email'),
      website: rowValue(row, headerMap, 'website'),
      address: rowValue(row, headerMap, 'address'),
      city: rowValue(row, headerMap, 'city'),
      country: rowValue(row, headerMap, 'country'),
      notes: rowValue(row, headerMap, 'notes'),
    };
    const parsed = prospectSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row: index + 2, reason: formatValidationError(parsed.error) });
      continue;
    }

    validRows.push({
      ...parsed.data,
      source: 'manual',
      source_id: null,
      status: 'new',
    });
  }

  if (validRows.length > 0) {
    const { error } = await supabaseAdmin.from('prospects').insert(validRows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    inserted: validRows.length,
    skipped: errors.length,
    errors,
  });
}
