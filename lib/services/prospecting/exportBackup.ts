import { supabaseAdmin } from '@/lib/supabase/admin';

const EXPORT_PAGE_SIZE = 1000;
const EXPORT_COLUMNS = Array.from(new Set([
  'id',
  'clinic_name',
  'doctor_name',
  'phone',
  'email',
  'website',
  'address',
  'city',
  'country',
  'source',
  'source_id',
  'status',
  'notes',
  'metadata',
  'created_at',
  'updated_at',
  'unsubscribe_token',
  'unsubscribed_at',
  'prospect_id',
  'type',
  'subject',
  'body',
  'resend_id',
  'sent_at',
  'delivered_at',
  'opened_at',
  'error',
]));

type ExportRow = Record<string, unknown>;

async function fetchRows(
  table: 'prospects' | 'prospect_emails',
  idColumn: 'id' | 'prospect_id',
  ids: string[],
  errorMessage: string,
): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];

  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .in(idColumn, ids)
      .order('id', { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`${errorMessage} ${error.message}`);
    }

    const page: ExportRow[] = data ?? [];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return rows;
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value) ?? String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function serializeCsv(prospects: ExportRow[], emails: ExportRow[]): string {
  const knownColumns = new Set(EXPORT_COLUMNS);
  const additionalColumns = Array.from(new Set([
    ...prospects.flatMap((row) => Object.keys(row)),
    ...emails.flatMap((row) => Object.keys(row)),
  ])).filter((column) => column !== 'record_type' && !knownColumns.has(column)).sort();
  const columns = [...EXPORT_COLUMNS, ...additionalColumns];
  const headers = ['record_type', ...columns];
  const records = [
    ...prospects.map((row) => ({ recordType: 'prospect', row })),
    ...emails.map((row) => ({ recordType: 'email', row })),
  ];

  return [
    headers.map(csvCell).join(','),
    ...records.map(({ recordType, row }) =>
      [recordType, ...columns.map((column) => row[column])].map(csvCell).join(','),
    ),
  ].join('\r\n');
}

export async function buildProspectBackupCsv(
  ids: string[],
): Promise<{ csv: string; emailCount: number }> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    throw new Error('يجب تحديد عيادة واحدة على الأقل لإنشاء النسخة الاحتياطية.');
  }

  const [prospects, emails] = await Promise.all([
    fetchRows('prospects', 'id', uniqueIds, 'تعذر تصدير بيانات العيادات:'),
    fetchRows('prospect_emails', 'prospect_id', uniqueIds, 'تعذر تصدير سجلات البريد المرتبطة:'),
  ]);

  try {
    return {
      csv: `\uFEFF${serializeCsv(prospects, emails)}`,
      emailCount: emails.length,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'خطأ غير معروف';
    throw new Error(`تعذر إنشاء ملف النسخة الاحتياطية: ${detail}`);
  }
}
