import { NextResponse } from 'next/server';
import {
  authorizeClinicRequest,
  DATA_ROLES,
  roleDenied,
} from '@/lib/services/clinicAuthorization';
import {
  generateBlogArticle,
  generateLinkedInPost,
  generateSalesEmail,
} from '@/lib/services/marketing/marketing-agent';
import { logEvent } from '@/lib/server/logging';
import { entitlementErrorResponse, withEntitlement } from '@/lib/subscription/entitlements';

const MAX_FIELD_LENGTH = 1000;

function isText(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAX_FIELD_LENGTH;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const clinicId = typeof body.clinic_id === 'string' ? body.clinic_id.trim() : '';
  if (!clinicId) {
    return NextResponse.json({ error: 'CLINIC_ID_REQUIRED' }, { status: 400 });
  }

  const authorization = await authorizeClinicRequest(req, clinicId);
  const denied = roleDenied(authorization, DATA_ROLES);
  if (denied) {
    return NextResponse.json(
      { error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: denied.status },
    );
  }

  const action = body.action;
  let generate: () => Promise<string>;
  if (action === 'linkedin') {
    const topic = body.topic;
    const audience = body.audience ?? 'أطباء الأسنان';
    if (!isText(topic) || !isText(audience)) {
      return NextResponse.json({ error: 'TOPIC_AND_AUDIENCE_REQUIRED' }, { status: 400 });
    }
    generate = () => generateLinkedInPost(topic, audience);
  } else if (action === 'sales_email') {
    const clinicName = body.clinicName;
    const doctorName = body.doctorName;
    const note = body.note;
    if (!isText(clinicName) || !isText(doctorName) || !isText(note)) {
      return NextResponse.json({ error: 'SALES_EMAIL_FIELDS_REQUIRED' }, { status: 400 });
    }
    generate = () => generateSalesEmail(clinicName, doctorName, note);
  } else if (action === 'blog_article') {
    const topic = body.topic;
    if (!isText(topic)) {
      return NextResponse.json({ error: 'TOPIC_REQUIRED' }, { status: 400 });
    }
    generate = () => generateBlogArticle(topic);
  } else {
    return NextResponse.json({ error: 'UNSUPPORTED_ACTION' }, { status: 400 });
  }

  try {
    const content = await withEntitlement(clinicId, 'agent_runs', generate);
    return NextResponse.json({ data: { content } });
  } catch (error) {
    const entitlementResponse = entitlementErrorResponse(error);
    if (entitlementResponse) return entitlementResponse;

    logEvent('marketing_agent_generation_failed', {
      clinic_id: clinicId,
      action,
      error: error instanceof Error ? error.message : 'Unknown generation error',
    }, 'error');
    return NextResponse.json({ error: 'MARKETING_GENERATION_FAILED' }, { status: 502 });
  }
}
