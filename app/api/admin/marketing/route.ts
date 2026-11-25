import { NextResponse } from 'next/server';
import {
  generateBlogArticle,
  generateLinkedInPost,
  generateSalesEmail,
} from '@/lib/services/marketing/marketing-agent';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';

const MAX_FIELD_LENGTH = 1000;
const LINKEDIN_AUDIENCES = {
  clinics: 'عيادات الأسنان',
  patients: 'المرضى',
  general: 'جمهور عام',
} as const;
const BLOG_WORD_COUNTS = [500, 1000, 1500] as const;

type LinkedInAudience = keyof typeof LINKEDIN_AUDIENCES;
type BlogWordCount = (typeof BLOG_WORD_COUNTS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength = MAX_FIELD_LENGTH): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength;
}

function isLinkedInAudience(value: unknown): value is LinkedInAudience {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(LINKEDIN_AUDIENCES, value);
}

function isBlogWordCount(value: unknown): value is BlogWordCount {
  return typeof value === 'number'
    && BLOG_WORD_COUNTS.some((wordCount) => wordCount === value);
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

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'INVALID_MARKETING_REQUEST' }, { status: 400 });
  }

  const type = body.type === undefined ? 'email' : body.type;
  if (type !== 'email' && type !== 'linkedin' && type !== 'blog') {
    return NextResponse.json({ error: 'INVALID_MARKETING_TYPE' }, { status: 400 });
  }

  if (type === 'email' && (!isText(body.clinicName) || !isText(body.doctorName) || !isText(body.note))) {
    return NextResponse.json(
      { error: 'CLINIC_NAME_DOCTOR_NAME_AND_NOTE_REQUIRED' },
      { status: 400 },
    );
  }

  if (
    type === 'linkedin'
    && (
      !isText(body.topic)
      || !isLinkedInAudience(body.audience)
    )
  ) {
    return NextResponse.json(
      { error: 'LINKEDIN_TOPIC_AND_VALID_AUDIENCE_REQUIRED' },
      { status: 400 },
    );
  }

  if (
    type === 'blog'
    && (
      !isText(body.title)
      || !isText(body.keywords)
      || !isBlogWordCount(body.wordCount)
    )
  ) {
    return NextResponse.json(
      { error: 'BLOG_TITLE_KEYWORDS_AND_VALID_WORD_COUNT_REQUIRED' },
      { status: 400 },
    );
  }

  try {
    if (type === 'email') {
      const content = await generateSalesEmail(
        (body.clinicName as string).trim(),
        (body.doctorName as string).trim(),
        (body.note as string).trim(),
      );
      return NextResponse.json({
        data: {
          content,
          type,
          metadata: { clinicName: body.clinicName, doctorName: body.doctorName },
        },
      });
    }

    if (type === 'linkedin') {
      const audienceKey = body.audience as LinkedInAudience;
      const content = await generateLinkedInPost(
        (body.topic as string).trim(),
        LINKEDIN_AUDIENCES[audienceKey],
      );
      return NextResponse.json({
        data: { content, type, metadata: { topic: body.topic, audience: audienceKey } },
      });
    }

    const title = (body.title as string).trim();
    const keywords = (body.keywords as string).trim();
    const wordCount = body.wordCount as BlogWordCount;
    const content = await generateBlogArticle(
      `العنوان: ${title}\nالكلمات المفتاحية: ${keywords}\nالطول المستهدف: ${wordCount} كلمة`,
    );
    return NextResponse.json({
      data: { content, type, metadata: { title, keywords, wordCount } },
    });
  } catch (error) {
    logEvent('platform_marketing_agent_generation_failed', {
      error: error instanceof Error ? error.message : 'Unknown generation error',
    }, 'error');
    return NextResponse.json({ error: 'MARKETING_GENERATION_FAILED' }, { status: 502 });
  }
}
