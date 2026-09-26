# الأعمال المتراكمة — المشكلات المفتوحة

## PWA — اسم/أيقونة/ألوان التطبيق ثابتة «AI-Receptions» على كل العيادات — ✅ مُصلَحة (2026-09-26)

- **العَرَض**: تثبيت التطبيق من `amal-x-ray-center.dentairec.com` يُنشئ أيقونة باسم
  «AI-Receptions» وبأيقونة المنصّة لا باسم المركز/شعاره. وعلى iPhone لا يجد
  المستخدم خيار «أضف إلى الشاشة الرئيسية» أصلًا في مكانه المتوقّع.
- **السبب الجذري (١)**: `public/manifest.json` ملف **ساكن واحد** يخدمه كل الـhosts
  (كل عيادة على نطاقها الفرعي)، و`app/layout.tsx` يثبّت
  `applicationName` / `appleWebApp.title` / `Viewport.themeColor` على قيم المنصّة.
  وiOS لا يقرأ manifest عند «الإضافة للشاشة» — يقرأ `apple-touch-icon` و
  `apple-mobile-web-app-title` فقط، فحتى مانيفست مُخصَّص وحده ما كان ليكفي.
- **السبب الجذري (٢)**: قيد Apple — لا نافذة تثبيت تلقائية على iPhone، والخيار
  مدفون في قائمة المشاركة، ويختفي تمامًا داخل متصفحات فيسبوك/إنستغرام/واتساب.
- **الإصلاح (اسم/شعار/ألوان)**: `app/manifest.json/route.ts` (مُسار ديناميكي،
  `runtime='nodejs'`, `dynamic='force-dynamic'`) + `lib/services/pwaManifest.ts`
  (منطق نقي قابل للاختبار + قراءة الهوية من **نفس** صف العيادة الذي يعرضه الموقع:
  `clinics.name` / `clinics.logo` / `settings.public_profile.{theme,description}`،
  بمنطق الـhost من `lib/vercel/domains`). `?slug=` يخدم صفحة `/c/{slug}`
  التوافقية على النطاق الأعلى، و**الـhost يفوز دائمًا** على الـ`?slug=` (الهوية
  غير قابلة للانتحال)، والأسماء المحجوزة/غير الموجودة/أي خطأ DB → مانيفست المنصّة
  (لا 500 ولا مانيفست مكسور). على مضيف العيادة يبقى `id`/`start_url`/`scope` = `/`
  لأن كل نطاق فرعي **أصل (origin) مستقل** — أي تطبيق مستقل، والترقية لا تُنشئ تطبيقًا مكررًا.
- **الإصلاح (تناسق الواجهة)**: على مساحة العيادة `generateMetadata` أصبح يضبط
  `applicationName` + `appleWebApp.title` + أيقونات العيادة (`brandMetadataIcons`)،
  و`generateViewport` يضبط `theme-color` بلون العيادة، مع `lib/server/requestCache`
  (غلاف حول `React.cache`) لتنفيذ استعلامات المساحة **مرة واحدة** لكل طلب بدل ثلاث
  (metadata + viewport + الصفحة). و`React.cache` غير مُصدَّر في بناء React العادي —
  فقط في `react-server` الذي يحلّه Next — فنداؤه مباشرةً على مستوى الوحدة كان يُسقط
  أي محمّل آخر للملف (`TypeError: cache is not a function` في اختبار صفحة `/c`)،
  لذلك يتحوّل الغلاف إلى تمرير مباشر (صحيح بلا تخزين مؤقت) خارج RSC.
  و`PLATFORM_VIEWPORT` صار المصدر الواحد لـ`app/layout.tsx` وللعيّنة العيادية
  (لا انحراف في عقد الموبايل #40)، و`InstallPWA` يستقبل `appName` (راية العيادة
  بدل «AI-Receptions»).
- **الإصلاح (تجربة iOS — تحسين تعليمات فقط، القيد قائم)**: التعليمات تسمّي
  المتصفح الحاوي إن كان تطبيقًا داخليًا (`inAppBrowserName`: فيسبوك/إنستغرام/
  واتساب/تيك توك/سناب/لينكدإن/X/وي تشات/تطبيق جوجل) وتفتح بخطوة «افتح الصفحة في
  Safari» مع زر **انسخ الرابط**، وخطوات مرقّمة أوضح لأيقونة المشاركة، وملاحظة
  صريحة أن Apple لا تسمح بنافذة تثبيت تلقائية على iPhone (طبيعي وليس خللًا).
- **قرارات مقصودة**: (أ) أيقونة الشعار تُعلَن `sizes:"any"`/`purpose:"any"` لأن
  مقاس ملف المالك غير معروف ولأن `maskable` تقصّ الشعارات غير المربّعة، مع
  **الإبقاء دائمًا** على أيقونتَي المنصّة 192/512 (`any maskable`) كي لا تتوقف
  قابلية التثبيت على صورة يرفعها المالك. (ب) لا وسيط (proxy) لشعارات المالك:
  جلب روابط يكتبها المستخدم من الخادم = جسر SSRF + تسريب خصوصية؛ تُستخدم كما هي
  بعد تحقق `https://` أو مسار داخلي فقط (و`http://`/`data:`/`javascript:` مرفوضة).
  (ج) `apple-touch-icon` يستخدم شعار العيادة **فقط إن كان PNG** — Safari يسقط إلى
  لقطة شاشة لغير PNG. (د) صفحة `/c/{slug}` تأخذ هوية العيادة في الميتاداتا لكن
  بلا بانر تثبيت (سطح توافق noindex؛ سطح التثبيت القانوني هو النطاق الفرعي).
- **تحقق حيّ** (`next build` = EXIT 0 ثم `next start`):
  `Host: amal-x-ray-center.dentairec.com/manifest.json` →
  `name:"Amal X-Ray Center"`, `short_name:"Amal X-Ray"`, `theme_color:"#9cafde"`,
  `background_color:"#93ccd7"` (ألوان العيادة من الـDB)؛ النطاق الأعلى → مانيفست
  المنصّة بلا تغيير؛ `?slug=hala-clinic` → `id/start_url = /c/hala-clinic`؛
  `Host: hala-clinic…?slug=amal-x-ray-center` → «hala-clinic» (الـhost فاز)؛
  `?slug=dashboard` و`?slug=does-not-exist` → المنصّة؛ الترويسات
  `content-type: application/manifest+json` + `cache-control: public, max-age=300`;
  صفحة العيادة تُصدر `theme-color #9cafde` و`application-name` و
  `apple-mobile-web-app-title` باسم المركز و`<link rel="manifest" href="/manifest.json">`
  نسبيًا (يُجلب من نطاق العيادة نفسه)، و`/ask` لم يتغيّر (AI-Receptions/#10B981).
- **اختبارات**: `tests/unit/pwa-manifest.test.ts` (30 حالة: الاسم المختصر، سلامة
  روابط الشعار، الأيقونات والتراجع الآمن، الألوان، `start_url/id`، اختيار الـhost
  على الـ`?slug=`، الأسماء المحجوزة، مانيفست المنصّة) + 4 حالات جديدة في
  `tests/unit/pwa-install.test.ts` لكشف المتصفحات الداخلية. وأُضيف `'manifest.json'`
  إلى `RESERVED_PUBLIC_SLUGS` (يفرضه اختبار `tenant-subdomains` المشتق من الملفات)،
  وحُذف `public/manifest.json` (تعارض Next بين ملف ساكن وroute لنفس المسار).
- **ملاحظة للمالك**: الاسم المعروض هو `clinics.name` من الـDB — لـ`amal-x-ray-center`
  هو حاليًا «Amal X-Ray Center» (إنجليزي). لتغييره إلى «مركز أمل للتصوير» (أو أي
  اسم عربي) يُعدَّل **اسم العيادة** في اللوحة: مصدر واحد للموقع وللتطبيق المثبّت.
- **بدون مهاجرات جديدة، بدون commit/push.**


## B18 — خدمات `imaging_center`/`dental_lab` لا تصل الموقع العام — ✅ مُصلَحة (2026-09-26)

- **العَرَض**: إضافة/تعديل/حذف خدمة من لوحة التحكم (`/dashboard/{slug}/services`)
  لمركز أشعة أو مختبر أسنان تظهر في اللوحة ولا تصل الموقع العام إطلاقًا.
- **السبب الجذري**: `app/api/clinic/services/route.ts` و`[serviceId]/route.ts`
  مكتوبان على جدول واحد ثابت `clinic_services` لكل الأنشطة، بينما الموقع العام
  يقرأ كتالوج النشاط: `imaging_services` (مركز أشعة) و`lab_services` (مختبر)
  عبر `lib/services/activityPublicSpace.ts` + `lib/services/imagingService.ts`.
  النمط الصحيح كان موجودًا مسبقًا في `app/api/clinic/activity-catalog/route.ts`.
- **دليل حيّ (قبل الإصلاح)**: صفوف `clinic_services` لـ`amal-x-ray-center` تحمل
  `deleted_at`/`active=false` بينما `imaging_services` ما زالت `active`
  → «المحذوف» في اللوحة يبقى ظاهرًا على الموقع، والتعديلات/الإضافات لا تُرى.
- **الإصلاح**: وحدة واحدة `lib/services/clinicServiceCatalog.ts` توجّه القراءة
  والكتابة حسب `clinics.activity_type` (والمسارات تستدعيها بعد التفويض فقط):
  `clinic → clinic_services`، `imaging_center → imaging_services`،
  `dental_lab → lab_services`، مع **مرآة** إلى `clinic_services` (مطابقة بالاسم،
  أفضل جهد + `logEvent` عند الفشل) لأنها تبقى مصدر الحجز/الإحالات/الفوترة/الـAI.
- **تفاصيل دقيقة**: أعمدة المجال `INTEGER` → تقريب (`toIntOrNull`) بدل خطأ 500؛
  `pricing_mode='fixed'` عند وجود سعر (وإلا لا يعرض الموقع سعرًا)؛ إحياء صف
  ناعم الحذف عند إعادة إنشاء نفس الاسم (فهرس `(clinic_id, name)` الفريد)؛ الحذف
  يتبع المرآة أيضًا؛ أعمدة الاستعلام لكل جدول على حدة (لا `turnaround_hours`
  لـ`imaging_services`، فلن تُطلب على قاعدة أنشئت من المهاجرات وحدها)؛
  فشل قراءة `activity_type` يرجع للسلوك القديم (`clinic_services`) مع تسجيل.
- **جزء ثانٍ ظاهر للمالك**: صف قديم بـ`pricing_mode='unspecified'` مع سعر موجب
  (مثل «مفصل الفكين» بسعر 80) لم يكن يُعرض سعره على الموقع إطلاقًا →
  `imagingServicePriceLabel` (المكوّن العام) و`describeImagingPrice` يعرضان الآن
  السعر الموجب كسعر ثابت، و`0/null` يبقى «بلا سعر».
- **اختبارات**: `tests/unit/service-catalog-activity-routing.test.ts` (10 حالات
  جديدة: توجيه كل نشاط + المرآة + `pricing_mode` عند تعديل السعر + الحذف/404 +
  تسمية السعر العام)
  + تحقّق حيّ E2E على `amal-x-ray-center` (إضافة → ظهور على الموقع مع السعر →
  تعديل السعر → حذف → اختفاء من الموقع ومن المرآة) ثم حذف كل صفوف الاختبار
  وتأكيد عدم بقاء أي أثر، + قراءة حيّة لـ`getActivityPublicSpace('amal-x-ray-center')`
  (الأسعار الظاهرة: 30 ₪ / 70–300 ₪ / 80 ₪). الاختبارات القديمة لم تُمس.

## B10 — إحداثيات 3 عيادات (تحتاج تحقيق — لا حسم)

- **قراءة DB** (أداة `supabaseAdmin` نفسها): `ahmad-clinic` و`alawael-clinic` و`almtmizon`
  بلا إحداثيات (`latitude/longitude = NULL`).
- **شهادة العميل** (تحقق يدوي للواجهة): الإحداثيات موجودة لكل العيادات.
- **الحالة**: خلاف موثّق، يحتاج تحقيقًا (كاش؟ طبقة عرض؟ تعديل لاحق؟).
- **الأثر المؤكد**: الغياب من DB يستبعد العيادة من **بطاقات `/ask`** فقط؛
  الوصول المباشر 6/6 سليم (أكّده العميل).
- **لا حسم هنا** — أي تحقيق جديد يُسجَّل بتاريخه ثم يُرحَّل لـ`06-decisions`.

## T25 — أخطاء `tsc` المتبقية — ✅ مُصلَحة (B17، 2026-09-26)

كانت 25 خطأ في 5 ملفات اختبار قديمة، وأُصلحت في المصدر لا في الاختبارات
(`tsc --noEmit` = 0، `npm run build` = EXIT 0):

- `day-status` (1): أُضيف `getDayStatus(clinicId, providerId, date, deps)` إلى
  `lib/services/bookingService.ts` (منطق «لماذا اليوم مغلق» بحقن التبعيات).
- `provider-optional-booking` (4): `missingBookingFields(state, requiresProvider = true)`
  في `lib/ai/conversationBooking.ts` (PHASE A — الافتراضي يحفظ السلوك القديم).
- `activity-navigation-pricing` (3) + `booking-resolution` (5):
  `ClinicServiceForAI` صار يقبل `requires_provider?` و`price?: number | null`
  (`lib/ai/clinicDataContext.ts`) + إضافة `requires_provider` إلى الـselect.
- `provider-schedule-api` (12): الاختبار كان ينادي معالج المسار بوسيط واحد،
  وNext 14 يمرّر `(req, { params })` — أُضيف كائن `params` كما يمرّره الإطار
  (التحققات لم تُمس).

الأخطاء الـ12 الأخرى (B15/B14) أُصلحت أيضًا: `cancelPublicBooking` /
`reschedulePublicBooking` يعيدان `patient_id`+`appointment_date`،
`appointmentId` غير المعرّف في مساري cancel/reschedule،
`getSupabaseClient` غير الموجود في `NotificationBell`،
و`description` غير الصحيح في `Toast` داخل `NotificationTemplateManager`.

## F39 — فشل السويت القديم (39 فشلًا في 8 ملفات) → 17 فشلًا في 4 ملفات بعد B17

- ✅ صارت خضراء بعد B17: `day-status` (4)، `provider-schedule-api` (12)،
  `provider-optional-booking` (1)، `notification-template-contract` (5).
- ❌ المتبقي (سابق، غير متعلق بـB17 — لم تُلمس ملفاته): `database-audit`،
  `localization-profile`، `portal-payments-api`، `portal-refunds-api`.
- مقياس ما بعد B17: `Tests 17 failed | 2112 passed | 1 skipped (2130)`.
- **تحديث (2026-09-26، B18)**: القياس الحالي على شجرة نظيفة (بعد `git stash`)
  صار `18 failed | 2111 passed | 1 skipped (2130)` — انضم `email-delivery`
  (اختبار الإرسال يصل لمزوّد البريد الحقيقي؛ يفشل بنفسه على HEAD نظيف، مُثبت
  بـ`git stash`) إلى القائمة نفسها. مع B18: `18 failed | 2121 passed | 1 skipped (2140)`
  (نفس عدد الفشل بالضبط + 10 اختبارات جديدة ناجحة).

مثبتة كسابقة عبر `git stash` (نفس الفشل على HEAD نظيف):
`database-audit, day-status, localization-profile, notification-template-contract,`
`portal-payments-api, portal-refunds-api, provider-optional-booking, provider-schedule-api`.
لا انحدار من P0/P1 (السويت نما +27 اختبارًا جديدًا كلها خضراء).

## COLD — زمن التشغيل البارد

أول طلب بعد الخمول قد يتجاوز مهلة الفحص → fail-open (200 بدل 301 مؤقتًا).
خُفّف برفع المهلة إلى 4s. إن عاد: ارفع المهلة أو وسّع الكاش — قرار جديد في `06-decisions`.
