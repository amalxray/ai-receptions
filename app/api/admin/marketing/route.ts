import { NextResponse } from 'next/server';
import { generateSalesEmail } from '@/lib/services/marketing/marketing-agent';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

const MAX_FIELD_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAX_FIELD_LENGTH;
}

export async function POST(request: Request) {
  const authorization = await requirePlatformAdmin(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: authorization.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  if (
    !isRecord(body)
    || !isText(body.clinicName)
    || !isText(body.doctorName)
    || !isText(body.note)
  ) {
    return NextResponse.json(
      { error: 'CLINIC_NAME_DOCTOR_NAME_AND_NOTE_REQUIRED' },
      { status: 400 },
    );
  }

  try {
    const content = await generateSalesEmail(
      body.clinicName.trim(),
      body.doctorName.trim(),
      body.note.trim(),
    );
    return NextResponse.json({ data: { content } });
  } catch (error) {
    logEvent('platform_marketing_agent_generation_failed', {
      error: error instanceof Error ? error.message : 'Unknown generation error',
    }, 'error');
    return NextResponse.json({ error: 'MARKETING_GENERATION_FAILED' }, { status: 502 });
  }
}
