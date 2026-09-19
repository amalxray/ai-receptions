# SUBSCRIPTION_PLANS.md — كتالوج الاشتراكات (4 طبقات، USD)

> آخر تحديث: 2026-09-19 · المصدر الرسمي للحقيقة: `public.billing_plans` (DB)
> هذه الوثيقة تصف **الحالة المعتمدة** + **حالة الترحيل الفعلية** + **مخاطر الاستمرارية**.

---

## 1. الكتالوج المعتمد

| plan_id | عربي | إنجليزي | شهري | سنوي | الوحدة | يوفّر سنوياً |
|---|---|---|---|---|---|---|
| `free_trial` | تجريبي | Free Trial | $0 | — | 30 يوم | — |
| `basic` | أساسية | Basic | **$39** = `3900` | **$399** = `39900` | USD (cents) | ~15% |
| `advanced` | متقدمة | Advanced | **$69** = `6900` | **$699** = `69900` | USD (cents) | ~15% |
| `center` | مركز | Center | **$119** = `11900` | **$1199** = `119900` | USD (cents) | ~15% |

- **العملة:** `usd` في `billing_plans.currency` وفي الكود (`SubscriptionPlan.currency`).
- **الأسعار بـ minor units** (سنتات): `3900 = $39.00`. نفس الاصطلاح في `price_per_month` وفي `Stripe unit_amount`.
- **الاشتراك السنوي:** `billing_interval = 'year'`، أو صف مستقل بمعرّف `<tier>_yearly` (انظر §5).

### سياسة التجريبي (free_trial)
- المدة: **30 يوم** (`trial_days = 30`).
- الميزات: **كل مميزات `advanced`** طوال مدة التجربة.
- بعد الانتهاء → **`limited`**: 5 مرضى + 10 محادثات AI/شهرياً.
  - ⚠️ ملاحظة تنفيذية: `limited` هو **دور** خطة الـ fallback (حالياً `starter`)، وليس معرّفاً رابعاً إلزامياً. التنفيذ المعتمد: `effectivePlanIdFor()` تُرجع معرّف خطة الـ limited عند انتهاء النافذة (`degraded = true`).

---

## 2. المصادر الثلاثة — يجب أن تبقى متطابقة

| # | المصدر | الملف / الجدول | الدور |
|---|---|---|---|
| 1 | **DB (الرسمي)** | `public.billing_plans` | المصدر الرسمي: الأسعار، الميزات، الحدود، `stripe_price_id` |
| 2 | fallback الكود | `lib/subscription/plans.ts` | يعمل فقط إن لم تُطبَّق المايقريشنات أو تعذّر قراءة الكتالوج |
| 3 | صفحة التسعير العامة | `components/landing/PricingSection.tsx` (+ `lib/landing/landing-copy.ts` → `pricing`) | العرض التسويقي للزائر |

**قاعدة إلزامية:** أي تعديل سعر يجب أن يلمس **الثلاثة معاً** في نفس الـ commit، وإلا ظهر تناقض بين المعروض والمخصوم.
`planCatalog.loadBillingPlansAll()` يقرأ من DB أولاً ويسقط على `plans.ts` فقط عند الغياب ⇒ **DB يتقدّم دائماً**.

---

## 3. الحدود (Feature caps)

### 3.1 الحدود القياسية — `billing_plans.limits` (EntitlementResource السبعة)
المفاتيح: `ai_messages` · `bookings` · `patients` · `providers` · `users` · `knowledge_docs` · `conversations`
الدلالة: `number` = سقف · `null` = **غير محدود صراحةً** · `مفتاح غائب` = **غير مُهيّأ** ⇒ يسقط على `STARTER_LIMITS`.

### 3.2 الحدود الخاصة بالنشاط — `plan_activity_caps`
مفاتيحها في `activity_capabilities` (سجل القدرات) و`ACTIVITY_CAPABILITY_REGISTRY` في الكود:
`imaging_services_limit` · `imaging_requests_limit` (→ `imaging_center`)
`lab_services_limit` · `lab_cases_limit` (→ `dental_lab`)

**سياسة الفرض (متعمّدة وغير متماثلة):**
| الحالة | القرار |
|---|---|
| صف موجود + قيمة رقمية | السقف = القيمة |
| صف موجود + `NULL` | **غير محدود** (منحة صريحة) |
| **صف غائب** لـ (plan, activity, capability) | **رفض (fail-closed)** |
| قدرة لا تنطبق على `activity_type` العيادة | **رفض (fail-closed)** |
| خطأ بنية تحتية/RPC في الفحوصات الخاصة بالنشاط | **رفض (fail-closed)** |
| خطأ بنية تحتية في الحدود القياسية (15C) | **سماح (fail-open)** |

النشاط `clinic` **لا يمرّ** بهذه البوابة إطلاقاً — يستخدم الحدود القياسية فقط (`hasActivitySpecificCaps('clinic') === false`).

---

## 4. سياسة الحالة → الخطة الفعّالة

`effectivePlanIdFor(subscriptionRow)`:

| `status` | النتيجة |
|---|---|
| `active` | خطة الاشتراك نفسها |
| `trialing` / `free_trial` وداخل النافذة | `free_trial` |
| `trialing` / `free_trial` وبعد النافذة | خطة الـ limited (**degraded**) |
| `past_due` · `unpaid` · `canceled` · مجهول | خطة الـ limited (**degraded**) |
| لا صف اشتراك | خطة الـ limited (**افتراضي آمن**) |

> ⚠️ **تعارض قائم:** `getPlan(null)` في `plans.ts` يُرجع `free_trial` بينما الافتراضي التنفيذي هو الـ limited. يجب توحيدهما.

---

## 5. نموذج الخطط السنوية (اختيار تصميمي)

**المعتمد: صف مستقل لكل فترة** ⇒ `basic` / `basic_yearly` / `advanced` / `advanced_yearly` / `center` / `center_yearly` في `billing_plans`، مع `billing_interval = 'month' | 'year'`.

**لماذا:** `plan_id` هو المفتاح الأساسي المستخدم في `subscriptions.plan_id` و`entitlement_usage` و`plan_activity_caps`، وفصل الصفوف يمنع أي غموض في الحدود عند التبديل، ويجعل حدّ «خطة واحدة فعّالة» صريحاً.

**البديل المرفوض:** عمود واحد يجمع شهري/سنوي ⇒ يخلط بين «السعر المعروض» و«الفترة المفوترة» ويحتاج منطق خاص في الـ checkout.

---

## 6. Stripe

### 6.1 الأسعار المُنشأة (وضع الاختبار — `sk_test`)
| Tier | Interval | `lookup_key` | Price ID | Amount |
|---|---|---|---|---|
| Basic | month | `basic_monthly_usd` | `price_1UHUbIPqB6gWlT7hNesJMdMY` | $39.00 |
| Basic | year | `basic_yearly_usd` | `price_1UHUbIPqB6gWlT7hAD0oxmql` | $399.00 |
| Advanced | month | `advanced_monthly_usd` | `price_1UHUbKPqB6gWlT7h3L15z9tJ` | $69.00 |
| Advanced | year | `advanced_yearly_usd` | `price_1UHUbKPqB6gWlT7hpJxLwll8` | $699.00 |
| Center | month | `center_monthly_usd` | `price_1UHUbLPqB6gWlT7hXAj9Qkem` | $119.00 |
| Center | year | `center_yearly_usd` | `price_1UHUbMPqB6gWlT7huHcbwK1M` | $1199.00 |

Products: `prod_VI4khvUQcw0k6g` (Basic) · `prod_VI4k00LPKW3CW8` (Advanced) · `prod_VI4klssKtRF21E` (Center)

- **إنشاء/استرجاع:** `node scripts/stripe-create-subscription-prices.mjs [--write-env] [--allow-live]`
  الـ script **idempotent** (يبحث بـ `lookup_key`)، ويرفض المفاتيح الحيّة إلا مع `--allow-live`.

### 6.2 المفاتيح المطلوبة في البيئة
```
STRIPE_SECRET_KEY          sk_test_* | sk_live_*
STRIPE_MODE                test | live          (افتراضي: test)
STRIPE_WEBHOOK_SECRET      whsec_*             ← إلزامي في الإنتاج
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  pk_*
STRIPE_PRICE_{BASIC,ADVANCED,CENTER}_{MONTHLY,YEARLY}
```

### 6.3 أولوية حلّ الـ Price ID
1. `billing_plans.stripe_price_id` (الرسمي)
2. `lib/subscription/planPrices.ts` (env)
3. لا شيء ⇒ **فشل صريح** `PAYMENT_NOT_CONFIGURED` (سلوك مقصود، لا سقوط صامت)

النمط المقبول: `^price_[A-Za-z0-9]+$` — أي قيمة أخرى (مثل الـ placeholder القديم `price_growth_monthly`) **تُرفض**.

### 6.4 التفعيل والتحقق
- `POST /api/payments/checkout` ينشئ الجلسة بـ `priceId` المحلول **خادمياً** (لا يُقرأ السعر من العميل أبداً).
- `app/api/payments/webhook/route.ts` يتحقق من التوقيع عبر `verifyStripeSignature` (نافذة ±300 ثانية ضد الإعادة)، ثم `webhookCheckoutActivation.ts` يعيد **مطابقة السعر/العملة/المبلغ** من Stripe قبل تفعيل الاشتراك.
- ⚠️ **بدون `STRIPE_WEBHOOK_SECRET` ستفشل كل عمليات التفعيل** — لا يوجد اشتراك يُفعّل بغير الويب هوك.

### 6.5 التغيير المستقبلي للسعر
- **المشتركون الجدد:** يسري فوراً (السعر يُحلّ لحظة الـ checkout).
- **المشتركون الحاليون:** **لا يتأثرون** — Stripe يسحب من الـ Subscription لا من الكتالوج. الرفع يحتاج `stripe.subscriptions.update` (غير موجود في الكود بعد) و/أو proration.

---

## 7. حالة الترحيل الفعلية (2026-09-19)

| # | البند | الحالة |
|---|---|---|
| FIX-1 | تحديث `billing_plans` (4 طبقات/أسعار USD) | ⏳ **معلّق** — يحتاج قراراً (انظر §8) |
| FIX-2 | تحديث `lib/subscription/plans.ts` | ⏳ **معلّق** — يجب أن يتم **ذرّياً** مع FIX-1 |
| FIX-3 | الخطط السنوية في DB | ⏳ معلّق (الأسعار في Stripe جاهزة ✅) |
| FIX-4 | `PricingSection.tsx` (toggle شهري/سنوي) | ⏳ معلّق |
| **FIX-5** | `activity_capabilities` — إضافة `imaging_services_limit` | ✅ **مطبّق** (3 → 4 صفوف) |
| **FIX-6** | `STRIPE_WEBHOOK_SECRET` في `.env.example` | ✅ **مطبّق** (+ قسم Stripe كامل) |
| **FIX-7** | `clinic_user_role` + 5 أدوار | ✅ **مطبّق** (8 قيم: owner, admin, receptionist, staff, doctor, manager, accountant, viewer) |
| FIX-8 | هذا الملف | ✅ |

---

## 8. مخاطر الاستمرارية — تُقرأ قبل أي ترحيل

1. 🚨 **`subscriptions.plan_id` بلا قيد FK** ⇒ إعادة تسمية معرّفات الخطط **لا تُرحّل الصفوف**، و`getPlanOrFallback()` يسقط على `free_trial` ثم الحدود على `STARTER_LIMITS` ⇒ **تخفيض صامت** للمشتركين الحاليين.
2. 🚨 **`plan_activity_caps.plan_id` عليها `ON DELETE CASCADE`** ⇒ حذف أو إعادة تسمية صف خطة **يحذف صفوف الحدود الخاصة بالنشاط** كانتحام. مثال حقيقي: `amal-x-ray-center` لديها `imaging_services_limit` مستخدم فعلياً ⇒ ستفشل **fail-closed** عند إضافة خدمة أشعة.
3. 🚨 **`founding` ليست مجرد تسمية** — هي ميزة منتج: بوابة `clinics.is_founding_member` + `FOUNDING_SLOTS_TOTAL = 100` + `founding_price_locked_at` + نصوص `lib/landing/landing-copy.ts`. إعادة تسميتها **تُلغي البوابة** في `app/api/payments/checkout/route.ts` ⇒ يصبح سعر التأسيس متاحاً لأي owner (ثقب self-grant).
4. ⚠️ **`starter` هو خطة «الحد الآمن»** في `effectivePlanIdFor` + `STARTER_LIMITS` + 19 ملف اختبار ⇒ حذفه مباشرة يكسر سياسة الحالة. الحل: **إعادة تسمية** إلى `limited` متزامنة مع كل المراجع.
5. ⚠️ **الاشتراكات الحيّة (3):** `amal-clinic` (pro/active) · `amal-x-ray-center` (founding/active + Stripe `sub_…UUYp` بـ **ILS 50/شهر**) · `hala-clinic` (founding/active يدوي بلا Stripe). تغيير الكتالوج إلى USD **لا يغيّر** ما يخصمه Stripe للسابقين.
6. ⚠️ **`amal-x-ray-center` عندها 15 مريضاً** — أي خطة بحدّ مرضى أقل ستخفضها عند تعطّل اشتراكها.

### ترتيب الترحيل الآمن المقترح (ذرّي، بلا نافذة تعطّل)
```
1. إدراج الخطط الجديدة أولاً (additive): basic, advanced, center [+ *_yearly]
2. ترحيل subscriptions.plan_id: pro→center, growth→advanced, founding→(مقعد تأسيس يحفظ السعر)
3. ترحيل plan_activity_caps.plan_id إلى المعرّفات الجديدة
4. إضافة rows في plan_activity_caps للمعرّفات الجديدة
5. تعطيل القديم is_active=false (لا حذف) ليبقى المرجع التاريخي سليماً
6. تحديث plans.ts + PricingSection.tsx في نفس الـ commit
```
الخطوة 5 تحافظ على سلامة `ON DELETE CASCADE` (لا حذف ⇒ لا انتحام).

---

## 9. المراجع في الكود

| الملف | الدور |
|---|---|
| `lib/subscription/plans.ts` | تعريف `SubscriptionPlan` + القائمة الاحتياطية |
| `lib/subscription/planCatalog.ts` | تحميل الكتالوج من DB (المصدر الرسمي) |
| `lib/subscription/planPrices.ts` | حلّ Stripe Price ID من env (server-only) |
| `lib/subscription/entitlements.ts` | الحدود القياسية + سياسة الحالة + عدّاد الاستخدام |
| `lib/subscription/activityEntitlements.ts` | القدرات الخاصة بالنشاط (fail-closed) |
| `lib/subscription/pendingPlan.ts` · `upgradeCta.ts` | خطة قيد الدفع + إشارات الترقية |
| `app/api/clinic/subscription/route.ts` | GET لقطة الاشتراك · POST للخطط المجانية فقط |
| `app/api/payments/checkout/route.ts` | إنشاء جلسة Stripe (الخطط المدفوعة فقط) |
| `app/api/payments/webhook/route.ts` | التحقق من التوقيع + التفعيل |
| `app/api/admin/subscriptions/route.ts` | تمديد يدوي (يكتب `subscriptions` لا `billing_plans`) |
| `db/migrations/20260830_billing_plans.sql` | إنشاء الجدول + البذرة الأولى |
| `db/migrations/20260916_phase1_entitlements_workflows.sql` | `activity_capabilities` + `plan_activity_caps` |
| `db/migrations/20260921_subscription_foundation_fixes.sql` | FIX-5 + FIX-7 |
| `scripts/stripe-create-subscription-prices.mjs` | إنشاء/استرجاع منتجات وأسعار Stripe |
| `scripts/apply-subscription-foundation-fixes.mjs` | تطبيق FIX-5/7 + تحقق الاستمرارية |


