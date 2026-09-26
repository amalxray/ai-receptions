# الأعمال المتراكمة — المشكلات المفتوحة

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

مثبتة كسابقة عبر `git stash` (نفس الفشل على HEAD نظيف):
`database-audit, day-status, localization-profile, notification-template-contract,`
`portal-payments-api, portal-refunds-api, provider-optional-booking, provider-schedule-api`.
لا انحدار من P0/P1 (السويت نما +27 اختبارًا جديدًا كلها خضراء).

## COLD — زمن التشغيل البارد

أول طلب بعد الخمول قد يتجاوز مهلة الفحص → fail-open (200 بدل 301 مؤقتًا).
خُفّف برفع المهلة إلى 4s. إن عاد: ارفع المهلة أو وسّع الكاش — قرار جديد في `06-decisions`.
