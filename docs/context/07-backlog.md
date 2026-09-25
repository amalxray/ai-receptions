# الأعمال المتراكمة — المشكلات المفتوحة

## B10 — إحداثيات 3 عيادات (تحتاج تحقيق — لا حسم)

- **قراءة DB** (أداة `supabaseAdmin` نفسها): `ahmad-clinic` و`alawael-clinic` و`almtmizon`
  بلا إحداثيات (`latitude/longitude = NULL`).
- **شهادة العميل** (تحقق يدوي للواجهة): الإحداثيات موجودة لكل العيادات.
- **الحالة**: خلاف موثّق، يحتاج تحقيقًا (كاش؟ طبقة عرض؟ تعديل لاحق؟).
- **الأثر المؤكد**: الغياب من DB يستبعد العيادة من **بطاقات `/ask`** فقط؛
  الوصول المباشر 6/6 سليم (أكّده العميل).
- **لا حسم هنا** — أي تحقيق جديد يُسجَّل بتاريخه ثم يُرحَّل لـ`06-decisions`.

## T25 — أخطاء `tsc` المتبقية (25 خطأ، سابقة)

كلها في 5 ملفات اختبار قديمة غير متعلقة بالنطاقات:
`provider-schedule-api` (12)، `booking-resolution` (5)،
`provider-optional-booking` (4)، `activity-navigation-pricing` (3)، `day-status` (1).
مقترح: مهمة تنظيف منفصلة. القاعدة: لا تُصلح اختبارًا بكسر عقده.

## F39 — فشل السويت القديم (39 فشلًا في 8 ملفات)

مثبتة كسابقة عبر `git stash` (نفس الفشل على HEAD نظيف):
`database-audit, day-status, localization-profile, notification-template-contract,`
`portal-payments-api, portal-refunds-api, provider-optional-booking, provider-schedule-api`.
لا انحدار من P0/P1 (السويت نما +27 اختبارًا جديدًا كلها خضراء).

## COLD — زمن التشغيل البارد

أول طلب بعد الخمول قد يتجاوز مهلة الفحص → fail-open (200 بدل 301 مؤقتًا).
خُفّف برفع المهلة إلى 4s. إن عاد: ارفع المهلة أو وسّع الكاش — قرار جديد في `06-decisions`.
