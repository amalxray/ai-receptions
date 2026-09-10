# DATA_RECOVERY.md — Disaster Recovery Runbook

> آخر تحديث: 2026-08-24 · المرجع الحاكم: PROJECT_STATUS.md
> القاعدة الذهبية: **Code rollback ≠ Database rollback** — قاعدة البيانات لا تُرجَع للخلف أبداً بـ DROP/DELETE؛ تُصلح بـ forward-fix migrations.

## معطيات الاسترداد
- **Supabase Project:** ap-south-1 · physical backup daemon (walg) مفعّل · **PITR غير مفعّل** · **لا backups مجدولة ظاهرة عبر API** (`backups: []`).
- **RPO الحالي الفعلي: غير محمي** حتى يفعّل المالك PITR/Backups من Dashboard. RPO المستهدف: ≤5 دقائق (PITR) أو ≤24 ساعة (daily backup).
- **RTO المستهدف:** < 1 ساعة.
- مسؤول التنفيذ: Owner (Dashboard) + مهندس النظام (استعادة/تحقق).

---

## A. حذف عرضي لبيانات (Accidental deletion)
1. **Detection:** بلاغ مستخدم / audit_logs يُظهر حذفاً غير متوقع / انخفاض row counts في مراقبة الصحة.
2. **Containment:** تجميد عمليات الكتابة ذات العلاقة (تعطيل الـendpoint إن لزم)، عدم تشغيل أي cleanup scripts.
3. **Recovery:** Supabase Dashboard → Database → Backups → اختر نقطة زمنية قبل الحذف → **Restore إلى مشروع Staging أولاً** → استخراج الجداول المتأثرة (patients/appointments...) وإعادتها لـProduction بـ insert targeted — ممنوع restore كامل فوق Production إلا بقرار صريح من المالك.
4. **Verification:** مقارنة row counts قبل/بعد، فحص foreign keys، تشغيل suite الاختبارات، تدقيق audit_logs.
5. **Communication:** إبلاغ العيادة المتأثرة بما استُعيد وما لا يزال ناقصاً.
6. **Postmortem:** سبب الحذف (bug? UI?) → regression test + soft-delete حيث ينقص.

## B. Migration خاطئة (Bad migration)
1. **Detection:** فشل deploy / أخطاء DB في logs بعد التطبيق.
2. **Containment:** إيقاف الـdeployment (Vercel rollback للكود فوراً). المهاجرات كلها additive — لا تدمّر بيانات.
3. **Recovery:** كتابة **forward-fix migration** تلغي أثر الخاطئة (drop index/إضافة عمود تصحيحي) — ممنوع عكس destructive.
4. **Verification:** `/api/health` = healthy + smoke على booking/checkout.
5. **Postmortem:** إضافة المهاجرة إلى قائمة المراجعة + اختبارها على staging قبل الإنتاج.

## C. Deploy تالف (Corrupted deployment)
1. **Detection:** spike في 5xx / health endpoint unhealthy بعد النشر.
2. **Containment:** Vercel → Deployments → **Rollback to previous good deployment** (< دقيقة).
3. **Recovery:** تشخيص محلي، إصلاح، نشر جديد.
4. **Verification:** health + critical flows (login, booking, AI chat).
5. **Postmortem:** لماذا لم تلتقطها الاختبارات؟ أضف تغطية.

## D. تعطل قاعدة البيانات (Database outage)
1. **Detection:** health 503 + alert المراقبة الخارجية.
2. **Containment:** التحقق من status.supabase.com؛ إن كان المشروع down → إبلاغ Supabase support.
3. **Recovery:** انتظار استعادة Supabase، أو Restore من backup إلى مشروع جديد وتحويل `SUPABASE_URL`.
4. **Verification:** row counts + RLS spot-checks + suites كاملة.
5. **Communication:** banner صيانة في الواجهة؛ إبلاغ العيادات.

## E. تعطل Stripe
1. **Detection:** فشل checkout (5xx من Stripe) / توقف webhooks.
2. **Containment:** النظام يعود بسلوك آمن: checkout يفشل برسالة عربية واضحة؛ **الاشتراك لا يتغير بدون webhook موقّع** (source of truth).
3. **Recovery:** webhooks المتأخرة يعيد Stripe إرسالها تلقائياً (retries) — المعالجة idempotent (مثبتة بالاختبارات). للتسوية اليدوية: مقارنة `subscriptions` مع Stripe Dashboard → أي حالة ناقصة تُصحح فقط عبر إعادة إرسال الحدث من Stripe (Resend event) وليس بكتابة يدوية.
4. **Verification:** ظهور الأحداث في logs + صف subscriptions صحيح.

## F. تعطل مزوّد AI (Gemini)
- **مُصلح برمجياً:** عند فشل/timeout/429/malformed يحفظ الـorchestrator رداً عربياً آمناً ويحوّل المحادثة إلى `awaiting_staff` (human handoff). لا ضياع رسائل، لا crash.
- **Verification:** tests/unit/reliability-recovery + اختبار المسار العام.

## G. تعطل Vercel
1. **Detection:** مراقبة خارجية (UptimeRobot) على `/api/health` تفشل بينما Supabase status طبيعي.
2. **Containment/Recovery:** انتظار Vercel status page؛ بديل مؤقت: نشر على حساب Vercel ثانٍ من نفس الريبو بنفس env vars.

## H. حساب مخترق (Compromised account)
1. **Detection:** audit logs — تسجيل دخول شاذ / تعديل أدوار غير مبرر.
2. **Containment:** حذف session المستخدم (Supabase Auth → sign out all)، تغيير كلمة المرور، إزالة membership المشبوه.
3. **Recovery:** تدقيق ما فعله الحساب (audit_logs) وعكس التغييرات.
4. **Postmortem:** فرض 2FA على حسابات المالكين (Supabase supports) — موصى به قبل التوسع.

## I. انكشاف سر (Secret exposure)
1. **Detection:** git scan / تقرير / سلوك غريب.
2. **Containment (فوري):** rotate المفتاح في مزوّده (Stripe/Gemini/Supabase service key) — الدوران يبطل القديم فوراً.
3. **Recovery:** تحديث `.env.local` وVercel env vars ثم redeploy. إذا وصل service_role للمتصفح: افحص logs لأي استخدام خارجي.
4. **Postmortem:** كيف تسرب؟ أضف فحص pre-commit للـsecrets.
