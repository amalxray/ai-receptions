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

## 6) فحوصات ما بعد النشر
- `https://ai-receptions.vercel.app/robots.txt` — تظهر قواعد زواحف AI
- `https://ai-receptions.vercel.app/llms.txt`
- `https://ai-receptions.vercel.app/sitemap.xml` — يشمل /book و/discover
- Rich Results Test على `/{slug}` → MedicalClinic
- schema.org validator على `/d/{slug}` → Physician
