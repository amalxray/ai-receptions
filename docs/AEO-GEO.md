# AEO + GEO — أساسات الظهور في محركات الإجابة والمحركات التوليدية

> Answer Engine Optimization (Google featured snippets، Bing) + Generative Engine
> Optimization (ChatGPT، Gemini، Perplexity، Claude). آخر تحديث: 2026-09-20

## 1) robots.txt (`app/robots.ts` — Next MetadataRoute)
زواحف AI مسموحة صراحةً (Allow /) مع نفس الاستثناءات:
`GPTBot · OAI-SearchBot · ChatGPT-User · Google-Extended · PerplexityBot ·
Perplexity-User · ClaudeBot · Claude-User · anthropic-ai · Applebot-Extended ·
Bytespider`
- مستبعد من الفهرسة: `/dashboard/` · `/admin/` · `/portal/` · `/api/`
- Sitemap: `https://www.dentairec.com/sitemap.xml`

## 2) llms.txt (`public/llms.txt`)
دليل موجّه للنماذج اللغوية: ما المنصة، لمن، الصفحات الرئيسية، ملاحظات
(العملات، المنطقة، التسجيل). يُقدَّم على `https://www.dentairec.com/llms.txt`.

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
- **ملف التحقق:** `https://www.dentairec.com/5e754e705e92a8b07dbe595c930ea146.txt`
- **التسجيل في Bing Webmaster Tools:**
  1. https://www.bing.com/webmasters → أضف الموقع → تحقق عبر XML/HTML أو CName
  2. أرسل الـ sitemap: `https://www.dentairec.com/sitemap.xml`
  3. IndexNow — أرسل دفعة أولى:
     ```
     POST https://api.indexnow.org/indexnow
     Content-Type: application/json
     {
       "host": "www.dentairec.com",
       "key": "5e754e705e92a8b07dbe595c930ea146",
       "keyLocation": "https://www.dentairec.com/5e754e705e92a8b07dbe595c930ea146.txt",
       "urlList": [
         "https://www.dentairec.com",
         "https://www.dentairec.com/ask",
         "https://www.dentairec.com/discover",
         "https://www.dentairec.com/book"
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
  -d '{"host":"www.dentairec.com","key":"5e754e705e92a8b07dbe595c930ea146","keyLocation":"https://www.dentairec.com/5e754e705e92a8b07dbe595c930ea146.txt","urlList":["https://www.dentairec.com/ask/article/SLUG"]}'
```
**الدفعة الأولى المنشورة (2026):** أسعار زراعة الأسنان في فلسطين · ألم الضرس · البانوراما مقابل CBCT · اختيار طبيب أسنان في نابلس · 10 علامات لزيارة الطبيب.
**الدفعة الثانية (10 مقالات — GEO/AEO):**
- Amal X-Ray (5): `cbct-nablus-guide-2026` · `panorama-xray-when-needed` · `cbct-vs-panorama-difference` · `dental-imaging-prices-nablus-2026` · `choose-imaging-center-nablus` — كلها تُرِبط داخلياً بـ `/amal-x-ray-center`
- عامة (5): `tooth-pain-when-serious` · `tooth-decay-symptoms-prevention` · `dental-implants-palestine-2026` · `root-canal-when-needed` · `dental-cleaning-every-6-months`
كل مقال: كبسولة إجابة بعد H1 مباشرة + أقسام H2 بصيغة أسئلة + أسعار محددة (بانوراما 30₪، CBCT 70-300₪، تنظيف 80-150₪، عصب 120-250₪، زراعة 1500-3000$) + FAQ (4-5) في حقل `faq` + رابط داخلي لمقال شقيق و`/book`.

## 8) فحوصات ما بعد النشر
- `https://www.dentairec.com/robots.txt` — تظهر قواعد زواحف AI
- `https://www.dentairec.com/llms.txt`
- `https://www.dentairec.com/sitemap.xml` — يشمل /book و/discover
- Rich Results Test على `https://{slug}.dentairec.com` → MedicalClinic
- schema.org validator على `/d/{slug}` → Physician

## 9) هوية الـ Canonical (مصدر واحد للحقيقة)
`lib/communications/links.ts` هو المصدر الوحيد لعنوان الموقع العام:

| البيئة | القيمة المستخدمة |
|---|---|
| Vercel Production (`VERCEL_ENV=production`) | `PRODUCTION_BASE_URL` = `https://www.dentairec.com` — **حاكمة** |
| Preview / تشغيل محلي | `NEXT_PUBLIC_APP_URL` ثم `APP_URL` |
| لا شيء مضبوط | `http://localhost:3000` |

القاعدة: في الإنتاج **لا يمكن** لأي متغير بيئة قديم (`NEXT_PUBLIC_APP_URL`)
أن يُعيد توجيه canonical/OG/sitemap/robots نحو `*.vercel.app` — هذا كان يحدث
فعلاً ويُشتّت إشارات الفهرسة. لتغيير الدومين الرسمي مستقبلاً: عدّل
`PRODUCTION_BASE_URL` (مكان واحد)، ولا تعتمد على متغيرات البيئة لهوية الإنتاج.

مكونات العميل (`ShareButtons` · `QRCodeCard` · JSON-LD في `AskClient`) تبدأ
بالدومين الرسمي ثم تستبدله بـ `window.location.origin` بعد التحميل — فلا تظهر
روابط مشاركة قديمة حتى لو حُقنت قيمة بناء قديمة في الحزمة.

### 9.1) هوية المستأجر (Tenant Canonical) — النطاق الفرعي

- **المصدر الواحد للهوية:** `clinicSpaceUrl(slug)` في `lib/vercel/domains.ts` →
  `https://{slug}.dentairec.com` (والجذر مشتق من `TENANT_ROOT_DOMAIN`، أي لا
  يوجد أي دومين مكتوب مرتين). كل الأسطح تقرأ منه: وسم `canonical`، JSON-LD،
  `sitemap.xml`، بطاقات `/ask`، وروابط لوحة التحكم — ولا يُبنى الرابط يدويًا في
  أي مكان آخر.
- **الروابط القديمة → 301 دائم** (في `middleware.ts`):
  `https://www.dentairec.com/{slug}` و `https://www.{slug}.dentairec.com/…`
  تُحوَّل إلى `https://{slug}.dentairec.com`. التحويل للـ slug في المسار يتم
  فقط إذا كان المستأجر موجودًا فعلاً (`/api/clinic/check-slug` + كاش داخلي 60
  ثانية، **وفشل مفتوح**): تحويل 301 لرابط مكتوب خطأً يُخزَّن في المتصفحات
  والزواحف ولا يمكن التراجع عنه.
- **لا يُلمس أي مسار محجوز:** `/book` · `/discover` · `/ask` · `/dashboard` ·
  `/admin` · `/login` · `/register` · `/portal` · `/api/*` · `/c/{slug}` ·
  `/d/{slug}` · `/q/{public_id}` · `robots.txt` · `sitemap.xml` · `llms.txt`.
- **`/c/{slug}`** صفحة توافق فقط: `noindex` + canonical إلى النطاق الفرعي — لا
  تُعلن كرابط رسمي (`legacyClinicUrl` للاستخدام الداخلي فقط).
- **`/d/{slug}`** يبقى على الدومين الرسمي: الطبيب ليس مستأجرًا ولا يملك نطاقًا
  فرعيًا (والتسمية `dr-*` قد تتصادم مع slug عيادة).
- **رمز QR** يُشفّر `https://www.dentairec.com/q/{public_id}` (معرّف ثابت
  opaque) على دومين المنصة — لا يحمل الـ slug ولا النطاق الفرعي، فتبقى الرموز
  المطبوعة صالحة بعد أي إعادة تسمية أو تغيير في استضافة المستأجر.
- **الجاهزية (Vercel-authoritative) — شرط لا اختيار:** النطاق الفرعي لا يعمل
  (لا DNS ولا شهادة) قبل تسجيل المضيف في مشروع Vercel. والتسجيل **best-effort**
  في التسجيل/التهيئة (كل خطأ يُبتلع حتى لا يُحجب المستأجر)، فقد يوجد slug حيّ
  بلا مضيف مُسجَّل. لذلك:
  - **الـ301 في المسار يُصدر فقط إذا كان المضيف مُسجَّلًا فعلاً**
    (`readVercelProjectDomainNames()` في `lib/vercel/subdomainReadiness.ts`،
    كاش 60 ثانية + `stale-if-error` حتى 10 دقائق + **fail-closed** عند تعذّر
    قراءة Vercel). قبل هذا الشرط كان 4 من 6 مستأجرين يُحوَّلون إلى مضيف تنتهي
    مصافحته TLS بالفشل (انحدار فعلي في الإنتاج).
  - **كل مُصدِّر رابط يقرأ الجاهزية** عبر `lib/vercel/tenantLinks.ts`:
    `ready → https://{slug}.dentairec.com` وإلا `https://www.dentairec.com/c/{slug}`
    (صفحة توافق تعمل اليوم). يشمل ذلك وسم `canonical`، JSON-LD، هدف 302 في
    `/q/{public_id}`، بطاقات `/ask`، و`sitemap.xml` (**يُدرج النطاقات الجاهزة
    فقط**؛ لا مسار مُحوَّل ولا صفحة `noindex` في الـsitemap).
  - **`settings.tenant.subdomain_status` سجل عرض لا قرار:** يقرأه زر «إعادة
    تجهيز النطاق» في لوحة التحكم (`POST /api/clinic/add-subdomain`) ويُكتب بعده
    عبر `persistClinicProvisioning` — أما القرار فيبقى من Vercel.
  - **السكربتات:** `npm run provision:tenants -- --persist [slugs…]` (كتابة
    idempotent — يعُدّ `domain_already_in_use` نجاحًا بعد التحقق من عضوية المضيف
    في المشروع) و`npm run verify:tenants` (قراءة خالصة للحالة الحيّة).

