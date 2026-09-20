# AEO + GEO — أساسات الظهور في محركات الإجابة والمحركات التوليدية

> Answer Engine Optimization (Google featured snippets، Bing) + Generative Engine
> Optimization (ChatGPT، Gemini، Perplexity، Claude). آخر تحديث: 2026-09-20

## 1) robots.txt (`app/robots.ts` — Next MetadataRoute)
زواحف AI مسموحة صراحةً (Allow /) مع نفس الاستثناءات:
`GPTBot · OAI-SearchBot · ChatGPT-User · Google-Extended · PerplexityBot ·
Perplexity-User · ClaudeBot · Claude-User · anthropic-ai · Applebot-Extended ·
Bytespider`
- مستبعد من الفهرسة: `/dashboard/` · `/admin/` · `/portal/` · `/api/`
- Sitemap: `https://ai-receptions.vercel.app/sitemap.xml`

## 2) llms.txt (`public/llms.txt`)
دليل موجّه للنماذج اللغوية: ما المنصة، لمن، الصفحات الرئيسية، ملاحظات
(العملات، المنطقة، التسجيل). يُقدَّم على `https://ai-receptions.vercel.app/llms.txt`.

## 3) Schema.org (JSON-LD)
| النوع | الموقع | الحالة |
|---|---|---|
| Organization (منصة) | `app/layout.tsx` — على كل الصفحات | **جديد** + metadataBase |
| MedicalClinic (عيادة) / imaging_center (Radiology) | `app/[slug]/page.tsx` — كل مساحة عامة `/{slug}` | **جديد** |
| MedicalBusiness (مختبر أسنان) | `app/[slug]/page.tsx` | **جديد** |
| Dentist + Physician + Offer + OpeningHours | صفحات الأطباء `/d/[slug]` (doctorJsonLd.ts) | موجود مسبقاً |
| FAQPage | `/ask/faq` | موجود مسبقاً |
| Article | `/ask/article/[slug]` | موجود مسبقاً |
| Organization (سنّي) | AskClient (نطاق /ask) | موجود مسبقاً |

## 4) Sitemap (`app/sitemap.ts` — ديناميكي)
يشمل: `/` · `/book` (**جديد**) · `/discover` (**جديد**) · `/ask` + صفحاته
(articles/stories/tips/faq/about/contact/privacy/terms) · مقالات /ask المنشورة ·
`/d/{slug}` (الأطباء القابلون للفهرسة) · `/{slug}` (المساحات العامة المشتركة
في الاكتشاف). ملاحظة: `/c/{slug}` مقصودة الغياب (noindex + canonical إلى /{slug}).

## 5) IndexNow (Bing + Yandex + Seznam — تحديث فوري)
- **المفتاح:** `5e754e705e92a8b07dbe595c930ea146`
- **ملف التحقق:** `https://ai-receptions.vercel.app/5e754e705e92a8b07dbe595c930ea146.txt`
- **التسجيل في Bing Webmaster Tools:**
  1. https://www.bing.com/webmasters → أضف الموقع → تحقق عبر XML/HTML أو CName
  2. أرسل الـ sitemap: `https://ai-receptions.vercel.app/sitemap.xml`
  3. IndexNow — أرسل دفعة أولى:
     ```
     POST https://api.indexnow.org/indexnow
     Content-Type: application/json
     {
       "host": "ai-receptions.vercel.app",
       "key": "5e754e705e92a8b07dbe595c930ea146",
       "keyLocation": "https://ai-receptions.vercel.app/5e754e705e92a8b07dbe595c930ea146.txt",
       "urlList": [
         "https://ai-receptions.vercel.app",
         "https://ai-receptions.vercel.app/ask",
         "https://ai-receptions.vercel.app/discover",
         "https://ai-receptions.vercel.app/book"
       ]
     }
     ```
  4. عند نشر/تحديث صفحة عامة (مساحة /{slug} أو طبيب /d/{slug}) أرسل URL واحد
     بنفس الصيغة (حد 10,000 URL لكل طلب).

## 7) محتوى المقالات (AEO) — كيف تُضاف مقالة قابلة للاقتباس
بنية كل مقال في `platform_articles` (تُدار من `/admin/articles`):

- **كبسولة الإجابة** في أول المحتوى: `<div class="answer-capsule"><p><strong>الإجابة السريعة:</strong> …</p></div>` — 40–60 كلمة تجيب السؤال مباشرة (هذا النص هو ما يقتبسه ChatGPT/Bing).
- **5 أقسام H2 بصيغة أسئلة** على الأقل + قائمة أو جدول عملي + اقتباس `blockquote`.
- **الطول المستهدف:** 800–1200 كلمة في `content`.
- **حقل `faq` (jsonb)**: مصفوفة `[{ "question": "…", "answer": "…" }]` بـ 3–5 عناصر.
  صفحة المقال تبني منه تلقائياً:
  - `<script type="application/ld+json">` من نوع **FAQPage** (بجانب Article)
  - قسم مرئي **«أسئلة شائعة»** تحت المقال — الشرط الذي تطلبه Google لقبول FAQPage.
- **الوسوم** تُغذّي `keywords` ووسوم OG. الصفحة canonical على `/ask/article/{slug}` وتدخل sitemap و RSS تلقائياً.

**بعد نشر أي مقال:** أرسل رابطه إلى IndexNow (الحد 10,000 URL/طلب) — يُبلَّغ Bing/Yandex خلال دقائق:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json" \
  -d '{"host":"ai-receptions.vercel.app","key":"5e754e705e92a8b07dbe595c930ea146","keyLocation":"https://ai-receptions.vercel.app/5e754e705e92a8b07dbe595c930ea146.txt","urlList":["https://ai-receptions.vercel.app/ask/article/SLUG"]}'
```
**الدفعة الأولى المنشورة (2026):** أسعار زراعة الأسنان في فلسطين · ألم الضرس · البانوراما مقابل CBCT · اختيار طبيب أسنان في نابلس · 10 علامات لزيارة الطبيب.

## 8) فحوصات ما بعد النشر
- `https://ai-receptions.vercel.app/robots.txt` — تظهر قواعد زواحف AI
- `https://ai-receptions.vercel.app/llms.txt`
- `https://ai-receptions.vercel.app/sitemap.xml` — يشمل /book و/discover
- Rich Results Test على `/{slug}` → MedicalClinic
- schema.org validator على `/d/{slug}` → Physician
