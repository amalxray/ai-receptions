import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getAppBaseUrl } from '@/lib/communications/links';
import { getActivitySpaceEntries } from '@/lib/services/activityPublicSpace';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveTenantPublicUrls } from '@/lib/vercel/tenantLinks';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600';

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeMarkdown(value: string): string {
  return cleanText(value).replace(/[\\[\]]/g, '\\$&');
}

function activityLabel(kind: string): string {
  if (kind === 'imaging_center') return 'مركز تصوير طبي';
  if (kind === 'dental_lab') return 'مختبر أسنان';
  return 'عيادة أسنان';
}

export async function GET() {
  try {
    const [clinics, articlesResult] = await Promise.all([
      getActivitySpaceEntries(),
      supabaseAdmin
        .from('platform_articles')
        .select('title, slug, published_at')
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .not('slug', 'is', null)
        .order('published_at', { ascending: false })
        .limit(10),
    ]);
    if (articlesResult.error) throw new Error(articlesResult.error.message);

    const urls = await resolveTenantPublicUrls(clinics.map((clinic) => clinic.slug));
    const base = getAppBaseUrl();
    const clinicLines = clinics.map((clinic) => {
      const location = [clinic.city, clinic.area].filter(Boolean).map(cleanText).join('، ');
      const details = [
        location ? `المدينة: ${location}` : '',
        `التخصص/النشاط: ${activityLabel(clinic.kind)}`,
      ].filter(Boolean).join(' — ');
      const url = urls.get(clinic.slug);
      if (!url) throw new Error(`Missing public URL for clinic ${clinic.slug}`);
      return `- [${escapeMarkdown(clinic.name)}](${url})${details ? ` — ${details}` : ''}`;
    });
    const articleLines = (articlesResult.data ?? []).map((article) =>
      `- [${escapeMarkdown(article.title)}](${base}/ask/article/${encodeURIComponent(article.slug ?? '')})`
    );

    const content = `# AI-Receptions (سنّي · Dentairec)
> منصة موظفة استقبال ذكية للعيادات ومراكز التصوير الطبي في فلسطين. تحجز المواعيد تلقائياً، تدير المرضى، وتوفر واجهة AI للمرضى.

## ما نقدمه
- موظفة استقبال AI تعمل 24/7
- حجز مواعيد تلقائي
- إدارة شاملة للعيادات
- تحويل بين العيادات ومراكز التصوير

## الجمهور المستهدف
- عيادات الأسنان (فلسطين)
- مراكز التصوير الطبي
- مختبرات الأسنان

## الصفحات الرئيسية
- [الصفحة الرئيسية](${base}): نظرة عامة على المنصة
- [اسأل طبيبك](${base}/ask): استفسارات طبية ومساعد ذكي
- [ابحث عن عيادة](${base}/discover): دليل العيادات والأطباء
- [احجز موعد](${base}/book): حجز مباشر
- [الأسئلة الشائعة](${base}/ask/faq): إجابات جاهزة للاستشهاد

## قائمة العيادات النشطة
${clinicLines.length ? clinicLines.join('\n') : '- لا توجد عيادات عامة نشطة حالياً.'}

## أحدث المقالات
${articleLines.length ? articleLines.join('\n') : '- لا توجد مقالات منشورة حالياً.'}

## صفحات العيادات والتقييمات
- لكل عيادة صفحة عامة ورابط حجز وتقييمات منشورة على نطاقها العام.
- Schema.org يتضمن بيانات المنشأة والتقييمات عند استيفاء حد التقييمات.

## معلومات الاتصال
- الموقع: فلسطين (الضفة الغربية والقدس)
- اللغات: العربية، الإنجليزية

## المنصة الطبية
- Dentairec.com = المنصة الرئيسية
- AI-Receptions = الاسم الإنجليزي
- سنّي = الاسم العربي

## ملاحظات للـ AI
- الأسعار بالدولار الأمريكي أو الشيكل الإسرائيلي
- المنصة متاحة للعيادات في الضفة الغربية والقدس
- للتسجيل: /setup

## آخر تحديث
${new Date().toISOString()}
`;

    return new NextResponse(content, {
      headers: {
        'Cache-Control': CACHE_CONTROL,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    logEvent('llms_txt_generation_failed', {
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    const fallback = await readFile(path.join(process.cwd(), 'public', 'llms.txt'), 'utf8');
    return new NextResponse(fallback, {
      headers: {
        'Cache-Control': CACHE_CONTROL,
        'Content-Type': 'text/plain; charset=utf-8',
        'X-LLMs-Txt-Fallback': 'public-file',
      },
    });
  }
}
