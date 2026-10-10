# Roadmap — خريطة الطريق الموحّدة

آخر تحديث: 2026-10-10

> **حدود الدليل:** هذا الملخص يجمع سجل Git المحلي، وثائق المشروع، واختبارات
> هذه المراجعة. لا يعني وجود migration أو نجاح اختبار محلي أنه نُشر أو طُبّق
> على قاعدة الإنتاج. حالة النشر وإغلاق البوابات تتطلب دليلاً من البيئة المالكة.
> آخر تقرير جاهزية آلي محفوظ يعود إلى 2026-09-03؛ انظر
> [`production-readiness-report.json`](./production-readiness-report.json).

## 🎯 الرؤية الاستراتيجية

تقديم نظام تشغيل آمن متعدد العيادات يجمع الحجز، التواصل، إدارة المرضى، والذكاء
التشغيلي مع عزل بيانات مضبوط لكل عيادة. التوسع إلى اكتساب المرضى والنمو المالي
يتم تدريجياً بعد تأمين الاستعادة والاشتراكات والامتثال وموافقة المالك.

## ✅ المُنجز (مرتّب زمنياً)

| التاريخ | المرحلة | ما أُنجز | الأدلة | الحالة |
|---|---|---|---|---|
| تواريخ migrations أغسطس–سبتمبر 2026 | STEP 15A–15D | أساس المنصة والاشتراكات/الاستحقاقات والهوية العامة والـQR. يذكرها مرجع PP-8 كمنجزة. | `db/migrations/20260830_billing_plans.sql`, `20260831_entitlement_usage.sql`, `20260832_clinic_public_id.sql`; `docs/pp8-product-ux-spec.md` | مغلقة في سجل المنتج؛ تطبيق جميع migrations على الإنتاج غير مثبت في هذا التقرير. |
| تواريخ التنفيذ في 2026 | PP-1 → PP-7 | بوابة المريض، الحجز العام، الملفات/التشغيل، التحليلات المالية والنمو؛ يصرّح PP-8 بأن هذه المراحل مغلقة. | `docs/pp8-product-ux-spec.md`; الخدمات وواجهات `app/api/`؛ migrations الخاصة بها | مغلقة حسب توثيق المنتج؛ لا يوجد هنا سجل نشر منفصل لكل PP. |
| 2026-09-01 → 2026-09-14 | Accounting Phase A–C، Localization، Insurance، Payroll Foundation، Financial Reporting، Growth | طبقات محاسبية وملفات محلية/تأمين ورواتب وتقارير ونمو، بإضافات schema موثقة زمنياً. | migrations `20260901`–`20260908`; `docs/architecture-decisions.md`; `docs/financial-ledger-kinds.md` | تنفيذ موثق في الشيفرة؛ الحالة الحية لكل migration غير معاد التحقق منها الآن. |
| 2026-09-03 وما بعده | Phase 8 readiness procedures | بوابات آلية وخطة staging/restore موثقة؛ لم يُثبت إغلاق البوابات الخارجية. | `scripts/production-readiness-gate.mjs`; `docs/phase8-restore-drill.md`; `docs/external-gates.json` | الإجراءات جاهزة، التنفيذ/الاستعادة محجوبان. |
| 2026-09-11 | Platform Admin — Phase A/B | أساس المالك ولوحات وواجهات إدارية؛ يسجل `PROJECT_STATUS.md` نشر Phase B على commit `43c80b6` مع Stripe webhook secret ما زال معلقاً حينها. | `PROJECT_STATUS.md` § 2026-09-11; commit `43c80b6` المذكور فيه | نشر جزئي حسب سجل الحالة التاريخي؛ الحالة الإنتاجية الحالية تحتاج smoke test. |
| 2026-09-23 → 2026-09-29 | Team Invitations، N14، N30، B51-H/D/H2 | دعوات آمنة، ملف مريض ذكي وواعٍ بنوع العيادة، معالجة إعداد Supabase ومنع fallback وهمي في المرضى/المواعيد. | `PROJECT_STATUS.md`; migration `20261010_clinic_invitations.sql`; سجلات N14/N30/B51 في الملف | مغلقة محلياً/اختبارات وفق سجل المشروع؛ فجوات قديمة موثقة تشمل leads وصفحات sticky-error. |
| 2026-10-01 | B60 | بناء نظيف وsmoke test لمسار لوحة التحكم على النطاق الرسمي كما وثق سجل المشروع. | `PROJECT_STATUS.md`; commit `2262b216` | نجاح الاختبار وقتها؛ لا يثبت سلامة كل إصدار أحدث. |
| 2026-10-03 → 2026-10-07 | Ask platform، WhatsApp adapter/webhook، محررات الصفحة العامة، الصور والمعرض وAI X-ray analysis | توسيع محررات المحتوى والرفع والتحليلات؛ توحيد عرض صور/فيديو المعرض وإضافة webhook/اختبارات WhatsApp. | commits `d65f845`, `b63da92`, `3b80318`, `b76fc58`, `4cf4f59`, `5b83c03`, `b49bf73`, `ab155e0`; migrations من `20261004` إلى `20261018` | تغييرات في Git؛ الانتشار وتهيئة مزودي الخدمة وتطبيق migrations غير مثبتة هنا. |
| 2026-10-08 → 2026-10-10 | Medical categories، chat booking confirmation، calendar fallback | حفظ تصنيف ملفات التصوير؛ كبسولة تأكيد حجز؛ السماح بالحجز المحلي عند تعذر Google Calendar؛ تحديث توافر الدردشة عند تغيير الوقت. | commits `84d865f`, `d87bb7d`, `ac1b6d7`, `76fbe30`; migration `20261008_medical_file_categories.sql` | مؤكد في Git/اختبارات محددة؛ التغييرات غير الملتزمة أدناه لم تُنشر. |
| 2026-10-10 | Google Calendar OAuth per clinic | ربط مستقل من جلسة العيادة، signed state، تشفير AES-256-GCM، قراءة/إنشاء/حذف حدث حي محلياً، حفظ بيانات refresh، ورفض availability لعيادة غير مربوطة. | `docs/google-calendar-booking-setup.md`; 13 اختباراً موجهاً ناجحاً و`tsc --noEmit` في جلسة التحقق | **Local-only**: غير ملتزم/غير منشور. قراءة حية وحدث مؤقت اختُبرا وحُذف الحدث؛ لا اعتماد إنتاج. |

**تغطية السلاسل القديمة:** توثق الحالة صراحةً N14/N30، B50/B51/B60،
والإصلاحات #29/#34/#39/#40؛ B10 موسوم مؤجلاً. مواصفة PP-8 وحدها تصرح بأن
PP-1→PP-7 وSTEP 15A–15D مغلقة. لا يوجد في المستودع سجل واحد يربط كل مرحلة
فرعية بتاريخ إغلاق وcommit واختبارات ودليل نشر؛ لذلك لا أختلق أرقام N/B أخرى
أو أنسب حالات production بلا مرجع.

### جرد الإضافات الحديثة التي احتاجت توثيقاً

- **واجهات/مسارات API جديدة أو موسّعة في هذا الإصدار:** تأكيد الحجز
  `POST /api/public/ai/booking-action`؛ Calendar `GET /api/clinic/google-calendar/connect`,
  `GET /api/clinic/google-calendar/callback`, واجهة حالة/بدء/فصل
  `/api/clinic/google-calendar`, و`POST /api/google-calendar/availability`
  و`POST /api/google-calendar/book`؛ WhatsApp webhook؛ تحليل الصور
  `/api/ai/analyze` و`/api/detect`؛ رفع غلاف الصفحة وصورة Hero؛ إدارة مزودي
  المقالات/القصص. حالة route الخاصة بـOAuth وstrict availability في worktree محلي.
- **Migrations الحديثة في `db/migrations/`:** `20261001_landing_page_content`,
  `20261002_payments_status_sync`, `20261003_notification_type_announcement`,
  `20261004_email_field_content_grants`, `20261004_landing_page_order`,
  `20261005_clinic_location`, `20261005_complete_landing_editors_defaults`,
  `20261005_google_calendar_booking_integration`,
  `20261005_landing_section_visibility`, `20261005_sync_hero_live_copy`,
  `20261005_sync_landing_section_editor_defaults`,
  `20261006_platform_admins_grant`, `20261007_ask_platform`,
  `20261008_ask_nearby_rpc`, `20261008_medical_file_categories`,
  `20261009_invoice_slug_numbering`, `20261010_clinic_invitations`,
  `20261011_permissions_and_custom_roles`, `20261012_payroll_engine`,
  `20261013_lahza_gateway`, `20261014_set_user_permissions_actor`,
  `20261015_fix_set_user_permissions`, `20261016_payroll_phase2`,
  `20261017_invitation_security`, `20261017_landing_hero_image_storage`,
  `20261018_success_stories_articles_visual_editors`, و
  `20261019_google_calendar_pending_confirmation_overlap`.
  **ملاحظة:** بعض أسماء migrations أحدث من تاريخ هذه المراجعة (10 أكتوبر)،
  وملف Lahza يقول صراحة إن migration الإنتاج لم يطبق. لا تُعامل القائمة على
  أنها سجل migrations مطبّقة؛ افحصها مع DBA قبل أي ترحيل.
- **تناقض migration مالي يحتاج حسمًا:** `PROJECT_STATUS.md` يذكر
  `db/migrations/20261019_fix_view_grants.sql` كالإصلاح المقترح للحادثة، لكنه
  لا يثبت تطبيقه على الإنتاج، والملف غير موجود في شجرة migrations الحالية.
  لا تعِد تشغيله ولا تعتبره قابلاً لإعادة النشر قبل استعادة الملف ومقارنة
  schema/migration history الحية.
- **تغييرات البيئة:** أضيفت في `.env.example` أربعة إعدادات خادمية لـGoogle
  OAuth: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
  `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`.
  أضيفت/توسعت أيضاً إعدادات WhatsApp: `WHATSAPP_APP_ID`,
  `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`,
  `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`. وتوثق العينة إعدادات Lahza
  (`LAHZA_SECRET_KEY`, `NEXT_PUBLIC_LAHZA_PUBLIC_KEY`, `LAHZA_MODE`,
  `LAHZA_WEBHOOK_SECRET`) وروابط أسعار Stripe وRoboflow. القيم المثالّية لا
  تثبت إعدادها على Vercel أو تفعيل القنوات خارجياً.
- **Scripts/أدوات:** `scripts/whatsapp-smoke-test.ts`,
  `scripts/verify-aeo-geo-status.mjs`, `scripts/upload_to_roboflow.py` و
  `scripts/README_UPLOAD.md` أضيفت في commits أكتوبر؛
  `scripts/merge_and_upload.py` تغير؛ و`train_local.py` و`scrub_metadata.py`
  ضمن worktree غير الملتزم. راجع README لكل أداة قبل تشغيلها على بيانات فعلية.
- **قرارات تم تدوينها الآن:** عزل تقويم Google لكل `clinic_id` وتجديد التوكن
  المشفر، منع API availability من تقديم نجاح تقويمي لعيادة غير مرتبطة، وحدود
  حالة الاختبار مقابل الإنتاج — في `docs/architecture-decisions.md` وملف إعداد
  Google Calendar.

## 🔄 قيد التنفيذ

| المرحلة | ما تبقى | المتوقع | المسؤول |
|---|---|---|---|
| Google Calendar production readiness | مراجعة/اعتماد OAuth، ضبط Vercel وGoogle Console، نشر التغيير، تحقق من migrations والسياسات على staging ثم اختبار إنتاج محدود | 1–3 أيام بعد موافقات المالك وGoogle | مالك المشروع + DevOps |
| External gates / Phase 8 | تفعيل النسخ وPITR، إنشاء staging، تنفيذ restore drill، وتوثيق نتيجة حقيقية | 1–3 أيام عمل بعد إتاحة حسابات المالك | المالك + DBA/DevOps |
| Subscription catalog migration | تحديد الخطة المقصودة لكل مشترك حي، dry run، ترحيل ذري ومراجعة limits/Stripe price | نصف يوم إلى يوم بعد موافقة المنتج والمالية | المالك + مسؤول Billing/DBA |
| Secret incident response | تدوير المفاتيح المتأثرة، التحقق من صلاحياتها، وإزالة النسخ المؤرشفة بعد التدوير | ساعات إلى يوم؛ يعتمد على مزودي الخدمة | المالك + مسؤول الأمن |
| PP-8 | الحصول على موافقة مالك صريحة ثم تنفيذ المراحل PP-8A→8E ببوابات القبول | تقدير spec؛ يُحدد بعد الموافقة والنطاق | المالك + Product/Engineering |

## 📅 المخطط (Next 90 Days)

- **الشهر 1 (10 أكتوبر–9 نوفمبر):** تدوير الأسرار ذات الأولوية؛ إعداد staging ونسخ/PITR؛ مراجعة migrations قبل أي تطبيق؛ إكمال التحقق الرسمي لـGoogle OAuth ونشر Calendar بعد smoke tests؛ تصحيح حالة خطط المشتركين الثلاثة.
- **الشهر 2 (10 نوفمبر–9 ديسمبر):** restore drill موثق، إغلاق البوابات الخارجية التي تم استيفاؤها، مراجعة الصلاحيات/tenant isolation واختبارات كاملة على staging، pilot محدود بعد موافقة المالك.
- **الشهر 3 (10 ديسمبر–8 يناير):** أول عيادة حقيقية جديدة بعد Go/No-Go؛ متابعة مؤشرات الاعتمادية والدعم؛ اعتماد PP-8 أو إبقاؤه مؤجلاً. التواريخ أهداف تخطيط لا التزام نشر.

## 🚧 مفتوح (External Gates)

الأولوية **P0** تعني حاجزاً قبل بيانات مرضى/إطلاق حقيقي، و**P1** قبل التوسع
أو المدفوعات الحية. يثبت `docs/external-gates.json` أن كل العناصر أدناه مفتوحة.
المذكور فيه سبع بوابات readiness؛ سجل JSON نفسه يحتوي أيضاً بوابة Lahza، أي
**ثمانية عناصر مفتوحة إجمالاً**.

| البوابة | الحالة | المطلوب | المالك | الأولوية |
|---|---|---|---|---|
| Supabase Backups/PITR | مفتوحة | تفعيل daily backups وPITR وتسجيل دليل/احتفاظ مناسب | مالك Supabase/DBA | P0 |
| Staging project | مفتوحة | مشروع Supabase ثانٍ وVercel Preview بمفاتيح اختبار فقط | المالك + DevOps | P0 |
| Restore drill | مفتوحة/محجوبة | تنفيذ `docs/phase8-restore-drill.md` بعد توافر staging وbackup | DBA/DevOps؛ المالك يقر الإغلاق | P0 |
| Stripe production secrets | مفتوحة | تزويد مفاتيح LIVE المحدودة وسر webhook عبر مدير أسرار | المالك/المالية | P1؛ قبل الاشتراك الحي |
| Stripe Connect KYC | مفتوحة | إكمال KYC/onboarding لحساب المنصة | المالك/المالية | P1؛ قبل payouts |
| الدول PS/JO/SA/KW | مفتوحة | تحديد دول الإطلاق ومتطلبات الامتثال/الضرائب لكل دولة | المالك + مستشار قانوني/مالي | P0 قبل الإطلاق الجغرافي |
| موافقة أول مريض حقيقي | مفتوحة | Go صريح بعد استيفاء backups وrestore drill وباقي ضوابط السلامة | المالك | P0 |
| Lahza live | مفتوحة | تطبيق migration `20261013_lahza_gateway.sql`، تسجيل webhook، توفير مفاتيح LIVE والتحقق بتجربة مراقبة | المالك + Lahza/DBA | P1؛ قبل تحصيل محلي حي |

## 📦 المؤجل (Backlog)

1. PP-8A→PP-8E — مواصفة فقط حتى موافقة مالك صريحة.
2. ميزات PWA، CSV import/export، print views، التقييم/feedback، وباقي SEO/GEO
   الواردة في قائمة المهام التاريخية.
3. Healthcare Network، DICOM/case exchange، multi-currency، voice AI،
   inventory/POs، claims engine الكامل، وفرنشايز — مؤجلة حسب D9 و
   `DO-NOT-BUILD-YET`.
4. WhatsApp/SMS/Telegram الإرسال الإنتاجي يتطلب إعدادات وموافقة المزود؛ وجود
   adapter أو webhook لا يثبت تفعيل قناة لكل عيادة.
5. تحديث الأسعار/الكتالوج السنوي ورفع أسعار الاشتراكات الحالية؛ لا يحدث تلقائياً
   لمجرد تحديث الكتالوج.

## 🎯 Milestones القادمة

- [ ] **M1:** نشر Google Calendar على الإنتاج بعد OAuth verification وstaging.
- [ ] **M2:** إغلاق External Gates بالأدلة؛ لا يغيّر agent حالة بوابة يملكها المالك.
- [ ] **M3:** تدوير الأسرار المعرضة والتحقق من إبطال النسخ القديمة.
- [ ] **M4:** أول عيادة حقيقية جديدة بموافقة Go/No-Go موثقة.
- [ ] **M5:** PP-8 Implementation بعد اعتماد Product/UX spec.

## 🔴 مخاطر حرجة وقرار المدير

### أسرار مكشوفة سابقاً

وثّق `PROJECT_STATUS.md` تعرّض تسعة أسرار/نسخ سرية نصياً في ملفات محلية أو
أرشيف: أربعة Gemini، Supabase PAT، Supabase service-role، Vercel token،
Vercel OIDC token، وStripe TEST secret. الموثق فقط أن Supabase PAT حُذف من
النسخة المحلية وبعض الأرشيف نُقل؛ **لا يوجد دليل في هذه الوثائق على تدوير
مفاتيح Gemini الأربعة أو service-role أو Vercel أو Stripe، ولا على إتلاف كل
الأرشيفات**. الحذف المحلي لا يبطل credential مسرّباً. لا تسجل أي قيمة سرية هنا.

### اشتراكات حية و`plan_id`

يسجل `docs/SUBSCRIPTION_PLANS.md` ثلاث اشتراكات حيّة عند فحص 2026-09-19:
`amal-clinic` على `pro`, و`amal-x-ray-center` على `founding` مع سعر ILS قديم،
و`hala-clinic` على `founding` يدوياً. لا يوجد تحقق حي حديث لهذه الحالات. توحيد
الكتالوج دون ترحيل `subscriptions.plan_id` و`plan_activity_caps` قد يسبب
fallback إلى خطة/حدود خاطئة أو تعطيل entitlement التصوير؛ لا تحذف الخطط القديمة
قبل dry run ومراجعة المالك.

### Restore drill

**BLOCKED — P0:** لا يوجد دليل staging أو backup/PITR فعّال أو restore ناجح.
لا تبدأ pilot على بيانات حقيقية حتى يكتمل drill على staging ويوافق المالك.

## توصية المدير — الخطوات الخمس التالية

1. **P0 — احتواء الأسرار:** أبطل ودوّر كل credential متأثر مع المالك؛ راجع
   سجلات الاستخدام واحتفظ بالأرشيف فقط إن كان مشفراً ومقيداً ثم أتلف النسخ القديمة.
2. **P0 — قابلية الاستعادة:** فعّل النسخ/PITR وأنشئ staging، ثم أكمل restore drill
   وtenant/RLS probes قبل بيانات مرضى حقيقية.
3. **P0 — Billing:** اجلب snapshot حديثاً للاشتراكات الثلاثة والخطط/caps، جهّز
   migration قابلة للمراجعة وطبّقها ذرياً بموافقة المالك.
4. **P1 — Google Calendar:** احصل على OAuth production approval، أضف إعدادات
   Vercel server-only، انشر تغييرات feature branch، واختبر عيادة واحدة مع
   تحقق من الفصل والـrefresh قبل تعميم الحجز.
5. **P0 — Go/No-Go:** احسم الدول والامتثال، ثم اطلب موافقة مالك صريحة لأول
   عيادة/مريض بعد تسجيل نتائج الاختبارات والاستعادة.

### ما يجب إنجازه قبل عيادة حقيقية جديدة

على الأقل: تدوير/احتواء الأسرار، backup/PITR + restore drill ناجح، staging،
تأكيد متطلبات البلد، اختبار tenant isolation/RLS، اشتراك وخطة/حدود متسقة،
مراقبة أخطاء وrollback، ثم موافقة المالك. لا يكفي نجاح build أو OAuth المحلي.
