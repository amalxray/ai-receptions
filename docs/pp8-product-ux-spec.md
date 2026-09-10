# PP-8 — Public Profiles & Growth Discovery Platform (Marketplace · SEO)

## PRODUCT / UX SPECIFICATION — DRAFT / READY FOR OWNER APPROVAL

> **Status:** DRAFT — لم تُعتمد بعد. هذه الجولة **Specification Only**:
> صفر implementation · صفر migrations · صفر schema changes · صفر UI changes · صفر routes.
> لا يُعدّل `PROJECT_STATUS.md` ولا تُعلن PP-8 PASS/CLOSED في هذه الجولة.
>
> **المصادر الحاكمة المقروءة فعليًا (لا افتراض):** `PROJECT_STATUS.md` (PP-1→PP-7 CLOSED ·
> STEP 15A–15D CLOSED) · `docs/architecture-decisions.md` (D1–D8 LOCKED) ·
> `lib/services/clinicPublicProfile.ts` · `lib/services/clinics.ts` (`resolvePublicClinic`) ·
> `app/c/[slug]/page.tsx` · `app/q/[publicId]/route.ts` + `lib/qr/clinicQr.ts` ·
> `db/migrations/20260721_initial_schema.sql` (providers/clinics) ·
> `lib/services/growthIntelligence.ts` (PP-7) · `lib/subscription/*` (billing_plans/entitlements).
>
> **Revision 2 — تعديلات المالك المعتمدة (مدمجة في هذه النسخة):**
> 1. تثبيت الـPositioning: PP-8 = Public Profiles & Growth Discovery Platform
>    (المكونات الستة + الدور المزدوج لصفحة الطبيب كقناة توزيع للمنصة) — §0/§1.
> 2. **ممنوع إعادة التصنيف الرجعي لـ`/c/[slug]`** — سلوك 15D المغلق يبقى حرفيًا؛
>    أي تغيير visibility/indexing مستقبلي = additive ومبرر بقرار مالك مستقل —
>    §10.2 · §12 · §17 · §20 · §22(16) · §23(AC-15) · §24(PP-8A).
> 3. PR-EMO: Problem-First UX كمتطلب منتج رسمي (التسلسل الإلزامي + 9 فئات ألم
>    + الرسالة الأساسية) — §6.
> 4. Subscriber Acquisition Funnel = جزء رسمي من نطاق PP-8 — §4.1.
> 5. اللاندينج القائمة = Acquisition Surface الأساسية؛ مقترحات Proof/Trust
>    توثيق استراتيجي فقط الآن، ولا Landing Page ثانية — §11.2 · §22(17) · §24(PP-8E).
> 6. Future Extensibility: Doctor → Dental Clinic · Dental Center ·
>    Radiology/Imaging Center · Specialist · كيانات أخرى — §21.

---

## 0. PP-8 POSITIONING & الموقع في دورة الحياة

**التعريف الرسمي (ثابت):** PP-8 = **Public Profiles & Growth Discovery Platform** —
**ليست** Doctor Directory ولا مجرد صفحة طبيب. مكونات الرؤية الستة:

1. Public Doctor/Clinic Profiles
2. Discovery
3. SEO
4. Subscriber Acquisition
5. Growth Loop
6. Platform Brand Exposure

**الدور المزدوج لصفحة الطبيب (ثابت):** أداة تسويق للطبيب ولعيادته، وفي
الوقت نفسه **قناة توزيع وتسويق لـ AI-Receptions / Shadi AI Solutions** —
تطبيقًا مباشرًا لـ MASTER PLAN (§2 Commercial Model، §14 Growth Loop،
§22 Product Vision في `PROJECT_STATUS.md`).

PP-8 هي المرحلة التي تحوّل المنتج من "نظام تشغيل داخلي للعيادة" إلى
**منصة نمو وظاهرة للسوق العام**. تقع في نقطة الالتقاء بين:

- **ما أُغلق فعليًا:** STEP 15D (صفحة عيادة عامة + QR deny-by-default) ·
  PP-7 (Growth/Retention Intelligence clinic-facing) · Entitlements (15C) ·
  Public Booking (`/book?slug=`) · Public Chat (`/chat?clinic=`).
- **ما وُثّق كفكرة مؤجلة:** `FUTURE — Public Doctor Marketing Profiles` (§13) و
  `MARKETING / GROWTH LOOP` (§14) في `PROJECT_STATUS.md` — PP-8 هي تفعيل هذه الفكرة
  بأقل نطاق صحيح، لا بإعادة تخيلها.

**الحد الأدنى الصحيح لـ "Marketplace/Discovery" في هذه المرحلة:**
دليل عام (Directory) للعيادات/الأطباء **المفعّلين صراحةً للظهور العام**، بحث أساسي
(اسم/تخصص/مدينة)، صفحات عامة قابلة للفهرسة opt-in، وتحويل الزائر إلى حجز/محادثة عبر
المسارات العامة القائمة. **ليست:** عمولات، مدفوعات مريض→طبيب، عروض/deals،
معاملات مالية، أو خوارزميات Ranking معقدة.

---

## 1. PRODUCT VISION

> "عيادتك تعمل بالنظام — والنظام يعرّفك للسوق."

الرؤية: أن يصبح كل مشترك يمتلك **حضورًا رقميًا جاهزًا للعمل من اليوم الأول** —
صفحة عامة أنيقة، قابلة للفهرسة في محركات البحث، قابلة للمشاركة عبر QR وواتساب
وفيسبوك، تقود المريض مباشرة إلى حجز حقيقي أو محادثة استقبال حقيقية — **بدون أي
جهد إضافي من الطبيب**، لأن البيانات المنشورة تأتي من الحقيقة التشغيلية للعيادة
(الخدمات، ساعات العمل، الأطباء) لا من نموذج تسويقي منفصل ينسى تحديثه.

وفي المقابل، كل صفحة عامة تحمل هوية المنصة بشكل طبيعي (footer/branding) →
**حلقة نمو (Viral/Referral Loop) موثقة أصلًا في §14 من PROJECT_STATUS**:
الطبيب يسوّق صفحته → المريض يصل → يرى AI-Receptions → طبيب آخر يكتشف المنصة.

**تغطية الرؤية الستة (إلزامية في أي تنفيذ لـPP-8):** Public Doctor/Clinic
Profiles · Discovery · SEO · Subscriber Acquisition · Growth Loop ·
Platform Brand Exposure — أي نطاق تنفيذي يستثني أحد هذه المكونات يُعد
انحرافًا عن هذه المواصفة.

## 2. STRATEGIC GOAL

1. **جذب مشتركين جدد:** صفحات عامة احترافية + دليل Discovery = قناة اكتساب
   (Acquisition Channel) طبيعية للمنصة، مبنية على قيمة ظاهرة لا وعود.
2. **زيادة قيمة الاشتراك القائم:** الطبيب المشترك يشعر أن المنصة تعمل لصالحه
   (جذب مرضى، حضور رقمي، SEO) — ما يرفع الـretention.
3. **إغلاق حلقة النمو:** Subscriber → Public Presence → QR/Share → Patient →
   Booking/Chat → Value → Referral.
4. **بذرة Marketplace قابلة للتوسع:** بنية Entity-type-agnostic (عيادة/طبيب/
   مركز أسنان/مركز تصوير لاحقًا) دون بناء معاملات مالية اليوم.

## 3. TARGET USERS

| الشخصية | السياق | ماذا يريد من PP-8 |
|---|---|---|
| **طبيب أسنان صاحب عيادة (Decision Maker)** | مشترك حالي أو محتمل؛ يدير كل شيء وحده أو مع موظفة واحدة | حضور رقمي يجلب مرضى دون جهد إضافي؛ أن يرتاح من الفوضى الإدارية |
| **طبيب/أخصائي داخل عيادة (Provider)** | موظف في عيادة مشتركة | صفحة مهنية عامة opt-in تعرّفه، تربطه بعيادته، وتجلب له مرضى |
| **صاحبة الاستقبال (Staff)** | تشغّل النظام يوميًا | ألا يزيد PP-8 عبئها؛ الأدوات تُدار من owner/admin فقط |
| **مريض محتمل (Visitor)** | يصل من QR/واتساب/Google | يفهم العيادة والطبيب بثقة، ويحجز أو يتحدث بسرعة من الجوال |
| **Malik (المنصة/Owner)** | Shadi AI Solutions | نمو اشتراكات وحلقة إحالة حقيقية، دون التزامات تشغيلية ثقيلة |

**ملاحظة فاصلة:** PP-8 لا تخدم المريض كبوابة علاج — المريض هنا **زائر للتحويل**
(حجز/محادثة) فقط. فصل موثق في §10 أدناه.


---

## 4. USER JOURNEYS

### 4.1 رحلة اكتساب المشترك (Subscriber Acquisition) — **هنا تقع PP-8 كأداة إقناع وقناة**

```
Doctor/Clinic
  → sees own problems (يرى مشاكله مضبوطة بلغته — §5)
  → sees how platform helps (يفهم كيف تجيبه المنصة)
  → sees public profile / growth ecosystem (يرى النموذج حيًا)
  → understands value (وقت مُوفَّر + حجوزات تصل + حضور رقمي)
  → subscribes (Founding/Growth/Pro — بنية billing_plans القائمة)
```

**هذه الرحلة Acquisition Funnel رسمي ضمن نطاق PP-8** — وليست نشاطًا
تسويقيًا جانبيًا؛ الـProof في اللاندينج (§11.2) هو أداة تنفيذها.

**دور PP-8 في هذه الرحلة:** هي "الصفحة المعروضة أمام الماس" — أي صفحة عامة
جاهزة (عيادة تجريبية/seed أو مشترك قائم) تصبح **أدلة إثبات (Proof)** في اللاندينج
والعروض التجارية: "هكذا ستظهر عيادتك. جرّبها."

### 4.2 رحلة المشترك بعد الاشتراك (Activation → Growth) — **PP-8 هي محركها**

```
Subscriber
  → يفعّل حضوره العام (opt-in صريح: تفعيل الصفحة + إكمال بياناتها)
  → يشارك عبر QR / WhatsApp / Facebook / Google (أدوات مشاركة جاهزة)
  → المرضى يكتشفون العيادة/الطبيب (Direct link أو Discovery/Google)
  → المريض يصل إلى booking/chat عبر المسارات العامة القائمة
  → العيادة تحصل على قيمة (حجوزات، وقت مُوفَّر، حضور رقمي)
  → الطبيب يبقى مشتركًا ويحيل زملاءه (Referral Loop)
```

### 4.3 رحلة المريض (Patient Service) — **موجودة أصلًا؛ PP-8 تقود إليها فقط**

```
Patient → صفحة عامة/Discovery → يقرر بثقة
        → /book?slug= (حجز ذاتي) أو /chat?clinic= (استقبال AI)
        → موعد حقيقي داخل نظام العيادة (tenant)
```

**PP-8 تنتهي عند نقطة التسليم:** أي زر "احجز" أو "تحدث" في أي صفحة عامة
**يعيد استخدام المسارات القائمة حرفيًا** — لا booking/chat logic جديدة.

---

## 5. PAIN POINTS (مشاكل الطبيب التي نخاطبها — صادقة ومبنية على قدرات موجودة)

| # | الألم اليومي | كيف تجيب عليه المنصة (قدرة موجودة فعليًا) | مكان PP-8 |
|---|---|---|---|
| 1 | "مكالمات وأسئلة متكررة تعطّل العمل" | AI Reception يعمل 24/7 ويحجز ويجيب (`/chat`, `/book` — CLOSED) | يُعرض كقيمة في الصفحات العامة والرسائل |
| 2 | "لا أملك حضورًا رقميًا حقيقيًا" | صفحة عامة جاهزة من بيانات العيادة (STEP 15D CLOSED) | PP-8: تحسينها + فهرستها + Discovery |
| 3 | "التسويق مكلف ويحتاج خبرة" | صفحتك + QR + مشاركة = تسويق بلا ميزانية، ومحركات البحث تجدك (PP-8 SEO) | PP-8 مباشرة |
| 4 | "مواعيد ضائعة وفوضى إدارية" | Booking ذكي + No-show/Waitlist Intelligence (PP-7 CLOSED — clinic-facing) | يُذكر كقيمة تشغيلية، لا يُبنى هنا |
| 5 | "مرضى قدامى يختفون" | Recall/Growth Layer موجودة (`clinic_recalls` + growthIntelligence) | يُذكر؛ لا تعديل |
| 6 | "لا أعرف كيف يقيس أحد أداء عيادتي" | Growth Intelligence dashboard (PP-7 CLOSED) | يُشار في اللاندينج كإثبات |
| 7 | "لا وقت للأعمال الإدارية — عملي الطبي هو الأهم" | المنصة تشتغل بدلًا عنه: استقبال + حجز + حضور عام | الرسالة الجامعة |

**قاعدة صرامة:** كل ألم يُخاطب بقدرة **موجودة أو معتمدة فقط**. أي وعد
Recall/No-show/Analytics يُصاغ بما هو متاح اليوم (intelligence clinic-facing)،
وليس بأتمتة لم تُبنَ.

---

## 6. EMOTIONAL POSITIONING

الهدف النفسي الموثق: عندما يرى الطبيب المنصة يجب أن يشعر —

> **"هذه المنصة تفهم مشاكلي، تقف إلى جانبي، وتساعدني أن أرتاح وأنمو."**

### متطلب منتج رسمي — PR-EMO (Problem-First UX)

هذا **Product Requirement ملزم** وليس copywriting: كل سطح تعاملي/تسويقي في
PP-8 (الصفحات العامة، Discovery، مقترحات اللاندينج) يجب أن يُبنى بهذا
التسلسل الإلزامي:

**Pain → Empathy → Understanding → Solution → Value → Trust → Conversion**

فئات الألم المعتمدة (تظهر بلغة يوم الطبيب، بلا مبالغة):

1. ضغط الاتصالات والرسائل
2. الفوضى الإدارية
3. ضياع الوقت
4. المواعيد الضائعة
5. ضعف الحضور الرقمي
6. صعوبة جلب مرضى جدد
7. ضعف عودة المرضى
8. صعوبة معرفة أداء العيادة
9. الحاجة للنمو مع الحفاظ على الراحة

**الرسالة الأساسية:** "المنصة في جانب الطبيب — تساعده في تخفيف العبء،
تنظيم العمل، جذب المرضى، ودعم نمو العيادة."

**قيد الصدق:** لا رسالة ولا وعد إلا بقدرة موجودة أو معتمدة (قائمة §5).
فئات الألم 3/4/7/8 تُخاطب بقدرات clinic-facing المغلقة (PP-5/PP-7/Growth
Layer) لا بأتمتة غير مبنية.

المبادئ:

1. **من الألم إلى الحل، لا من الـFeature إلى الـFeature:** كل قسم يبدأ بجملة
   يتعرّف عليها الطبيب من يومه الحقيقي، ثم الإجابة باقتضاب، ثم دليل.
2. **إحساس الارتياح (Relief):** الرسائل الأساسية حول "وقت يعود إليك" و"الاستقبال
   لا ينام" — لا مبالغات ("ستتضاعف أرباحك" ممنوعة).
3. **الشراكة لا البيع:** لغة "معك" لا "لك" ("صفحتك جاهزة"، "نحن نعرض عيادتك"
   لا "اشترِ الإعلان").
4. **الاحتراف الطبي قبل الزخرفة:** تصميم هادئ، طبي، موثوق (يوازي لغة الـUI
   القائمة: dark/stone/teal في صفحات 15D) — لا صراخ تسويقي.
5. **صادق بالحدود:** حيث لا توجد ميزة، لا نلمّح إليها. Empty states صادقة
   (نمط 15D: "لا توجد خدمات منشورة بعد").


---

## 7. VALUE PROPOSITION

**الوعد الجامع (One-liner):**
"موظفة استقبال ذكية تعمل 24/7 + صفحة عامة تجلب لك المرضى — من منصة واحدة،
وبلا أي جهد إداري إضافي."

**Value Pillars (محاور القيمة الثلاثة):**

1. **الاستقبال الذكي (Operate):** AI يفهم المريض ويدله على الخدمة/الطبيب/الوقت
   ويُكمل الحجز — القدرات CLOSED ومدعومة باختبارات.
2. **الحضور العام (Be Found):** صفحة عيادة/طبيب عامة، أنيقة، mobile-first،
   قابلة للفهرسة، مع QR ومشاركة — هي جوهر PP-8.
3. **فهم النمو (Grow with Insight):** لوحات تشغيل ونمو ومالية clinic-facing
   (Financial/Growth Intelligence — PP-5/PP-7 CLOSED) تعطي الطبيب إحساس السيطرة.

**دليل التمايز:** البيانات المنشورة تأتي من **الحقيقة التشغيلية** (خدمات وساعات
وأطباء حقيقية داخل النظام) — لا صفحة ثابتة منسية. هذا وعد قابل للإثبات.

---

## 8. PUBLIC DOCTOR PROFILE — SPECIFICATION

> حكمة قائمة: `PROJECT_STATUS.md §13` يعرّف الفكرة (`/doctor/<slug>`: الاسم، الصورة،
> التخصص، النبذة، الخبرة، الشهادات، الخدمات، معلومات العيادة، CTA للحجز، AI Reception،
> QR، SEO). PP-8 تحددها بأقل نطاق آمن.

### 8.1 المعلومات العامة المسموح نشرها (Allow-list حصري — deny-by-default)

| الحقل | المصدر | شرط النشر |
|---|---|---|
| Professional name | `providers.name` | opt-in للنشر العام |
| Title (اللقب المهني) | `providers.title` | opt-in |
| Specialty (التخصص) | **غير موجود** — additive marketing field | opt-in، قيمة مقترحة من قائمة |
| Bio / نبذة | **غير موجود** — additive | opt-in، نص مُراجَع من الطبيب |
| Photo | **غير موجود** — additive (رابط/asset) | opt-in؛ fallback: initial avatar (نمط 15D) |
| Clinic affiliation | العيادة المرتبطة عبر `clinic_id` | إلزامي عند النشر (صفحة طبيب بلا عيادة = غير مسموح) |
| Services | `clinic_services` النشطة | نفس قواعد 15D (أسعار opt-in × `price_visible_to_patients`) |
| Location/contact | `clinics.city/area/address_detail/phone` | عبر flags العيادة القائمة (`show_phone`…) — لا هاتف طبيب خاص |
| Booking CTA | `/book?slug=` القائم | دائمًا |
| Chat CTA | `/chat?clinic=` القائم | دائمًا |
| رابط صفحة العيادة | `/c/{slug}` | دائمًا (cross-link) |

**ممنوع منعًا باتًا في الصفحة العامة للطبيب:**
- هويات staff خاصة (`provider_type='staff'` **غير قابل للنشر** — فقط dentist/hygienist)
- بريد/هاتف الطبيب الخاص (`providers.email/phone` **لا يُنشران أبدًا** — جهات الاتصال تُدار من العيادة)
- أي patient data · conversations · ملفات علاجية · إحصاءات داخلية · أرقام أداء الطبيب
- أي جدول مواعيد تفصيلي (ساعات العمل تُعرض على مستوى العيادة فقط كما في 15D)

### 8.2 القواعد

1. **Opt-in صريح ومزدوج:** لا صفحة طبيب عامة إلا إذا (أ) فعّل owner/admin نشر
   الطبيب من لوحة العيادة، و(ب) اكتمل الحد الأدنى من البيانات (name + affiliation).
   الوجود في قاعدة البيانات **لا يمنح أي ظهور**.
2. **Slug عام مستقر:** `/d/{provider-public-slug}` (نمط نظير لـ`/c/{slug}`؛
   slug مستقر قابل للتجديد، لا internal uuid، لا `user_id`).
3. **الصفحة ترث العيادة:** tenant العيادة هو نطاق البيانات؛ عند إلغاء تفعيل
   نشر العيادة العامة أو حذف العيادة (soft) → صفحة الطبيب تصبح 404/خارج Discovery.
4. **استقلال البيانات عن الهوية الداخلية:** الـuser auth id لا يظهر في الرابط
   ولا في الـHTML (نفس مبدأ 15D: clinic_id داخلي، slug عام).
5. **Structured data:** `schema.org` نوع `Dentist`/`Physician` داخل كيان
   `MedicalBusiness` للعيادة (تفصيل §10).


---

## 9. DISCOVERY / MARKETPLACE — SPECIFICATION

### 9.1 الحد الأدنى للنسخة الأولى (V1)

صفحة دليل عامة واحدة: `/discover` (الاسم النهائي قرار مالك) تُظهر **فقط**
كيانات مفعّلة صراحةً للظهور العام:

- **بحث بالاسم:** اسم العيادة أو الطبيب (prefix/ILIKE كافٍ في V1).
- **التخصص (Specialty):** فلتر من قائمة ثابتة (V1) — يستخدم specialty الطبيب
  و`type/kind` العيادة.
- **المدينة/المنطقة:** فلتر من `clinics.city/area` (قائمة مشتقة من القيم الموجودة).
- **نوع الكيان:** عيادة / طبيب (V1) — بنية جاهزة لأنواع مستقبلية (مركز أسنان،
  تصوير، مركز طبي).

**ليس في V1:** بحث نصي حر بالخدمات، خريطة، تقييمات/reviews، sponsored listings،
أي Ranking معقد.

### 9.2 مبادئ الترتيب (Ranking) — بسيطة وقابلة للشرح

- **V1: ترتيب حتمي شفاف فقط** — الأحدث تفعيلًا أولًا (أو alphabetically حسب
  المدينة) مع pagination. **لا** score مخفي، **لا** أوزان مصطنعة، **لا** مدفوعات
  لتحسين الظهور.
- مستقبلًا (خارج PP-8): ranking يعتمد إشارات حقيقية (اكتمال الملف، سرعة الاستجابة،
  توفر مواعيد) — يُصمم حينها بموافقة مالك.

### 9.3 Indexing · Pagination · Privacy

- **Indexing:** Discovery نفسها `indexable` (لا تحوي بيانات خاصة)؛ صفحات الكيانات
  تتبع نموذج الرؤية (§10.2).
- **Pagination:** cursor أو page/limit بسيط؛ حد أدنى مثل 20/صفحة؛ لا استهلاك
  مفتوح للطلبات (نمط rate limiting المطبق في المشروع).
- **Privacy:** الدليل يعرض الحقول العامة فقط من projection مشابه لـ
  `getPublicClinicProfile` — لا أرقام هواتف غير opt-in، لا إحصاءات، لا بيانات مرضى.
- **Empty states صادقة:** "لا نتائج مطابقة — جرّب تخصصًا أو مدينة أخرى" —
  لا تعبئة بنتائج وهمية (نمط المشروع القائم).
- **Anti-spam/abuse:** البحث عبر GET مقيّد (rate limit بنمط القائم) · لا كتابة
  عامة إطلاقًا من Discovery · كل تعديل على بيانات الظهور يجري خلف
  `authorizeClinicRequest` داخل لوحة العيادة (owner/admin) · الدليل يقرأ فقط
  الكيانات المفعّلة ضمن اشتراك فعّال لمنع تراكم صفحات مهجورة.

### 9.4 قابلية التوسع للكيانات المستقبلية

التصميم يجب ألا يحصر المنصة في الأطباء: كيان الظهور العام يُصاغ كـ
**Profile Listing** يحمل `entity_kind` (clinic / provider / … مستقبلًا:
dental_center / imaging_center / medical_center) — إضافة نوع جديد = إضافة
قيمة للقائمة + projection، لا إعادة بناء. (توثيق فقط في هذه الجولة.)

---

## 10. SEO — SPECIFICATION

### 10.1 العناصر الأساسية

| العنصر | المواصفة |
|---|---|
| Metadata لكل صفحة عامة | title/description من بيانات الكيان (نمط `generateMetadata` القائم في `/c/[slug]`) + OG share |
| Canonical | `publicClinicUrl(slug)` والنظير الجديد للطبيب — absolute، من resolver واحد (لا base مكرر) |
| robots | نموذج الرؤية (§10.2) يحكم: `noindex, nofollow` أو indexable |
| sitemap.xml | يُولَّد server-side من الكيانات **Public + Indexable فقط** (استبعاد private/noindex) |
| Structured data | JSON-LD: `Dentist`/`MedicalBusiness` (خدمات، ساعات، عنوان، هاتف إذا opt-in) · `Physician` داخل كيان العيادة |
| Open Graph / Social | OG/Twitter cards + preview صحيح في واتساب/فيسبوك (عنوان/وصف/صورة) |
| Duplicate content | slug واحد قنوني لكل كيان؛ الروابط البديلة (id/publicId) تعيد التوجيه إلى slug القنوني (نمط `/q/[publicId] → /c/{slug}` القائم) |

### 10.2 نموذج الرؤية الثلاثي (يجب أن يُنفَّذ حرفيًا)

| الحالة | من يراها | robots | في Discovery؟ | في sitemap؟ |
|---|---|---|---|---|
| **Private** | العيادة فقط (dashboard) | — (لا صفحة عامة أصلًا → 404 للعام) | لا | لا |
| **Public + Noindex** | من يملك الرابط/QR | `noindex, nofollow` | لا | لا |
| **Public + Indexable** | الجميع + محركات البحث | indexable | نعم | نعم |

- **النطاق (ثابت):** النموذج الثلاثي يحكم **إضافات PP-8** حصرًا (صفحة الطبيب
  العامة، الظهور في Discovery، sitemap). **لا يُعاد تصنيف `/c/[slug]` ولا
  يُغيَّر سلوكها الافتراضي لمجرد PP-8** — سلوكها كما أُغلق في 15D يبقى حرفيًا
  (لا كسر، لا إعادة بناء للـPublic Clinic Profile القائم).
- أي تغيير مستقبلي في visibility/indexing لـ`/c/[slug]` يجب أن يكون
  **additive ومبررًا صراحةً** بقرار مالك مستقل — ليس ضمن النطاق الافتراضي لـPP-8.
- الظهور في Discovery يعتمد على **opt-in صريح جديد (additive flag)** —
  وجود صفحة عامة قائمة لا يعني الظهور في الدليل تلقائيًا.
- أي تغيير في حالة كيان ينعكس فورًا: Discovery + sitemap + robots.

### 10.3 Slug strategy

- clinic: `slug` القائم (15D) — لا تغيير.
- provider: slug عام جديد مستقر، فريد، قابل للتجديد (rollback آمن)، صيغة
  مبنية من الاسم + لاحقة قصيرة عند التكرار.
- اللغة: slug لاتيني (URL-safe) مع محتوى عربي — لا URLs ثنائية اللغة في V1
  (قرار يُعرض على المالك).

---

## 11. UX ARCHITECTURE (تجربة الصفحة العامة — pain → empathy → solution → proof → action)

### 11.1 هرم الصفحة العامة (للعيادة والطبيب على السواء)

1. **Hero (First 3 seconds):** هوية واضحة (صورة/شعار + اسم + تخصص/مدينة) +
   جملة طمأنة واحدة + CTA أساسي ظاهر دون تمرير ("احجز موعدك").
2. **Empathy strip:** سطر واحد يخاطب المريض ("مشغول؟ تحدث مع الاستقبال الآن —
   ترد فورًا، أي وقت") — يحل ألم المريض لا الطبيب هنا.
3. **Solution — الخدمات:** قائمة الخدمات الحقيقية (نمط 15D) مع المدة/السعر opt-in.
4. **Proof — الثقة:** ساعات العمل · الموقع · أدوات الثقة المتاحة فعليًا
   (استقبال AI يعمل الآن — مؤشر حالة صادق · انتماء لعيادة بنظام إلكتروني) —
   **بلا testimonials مختلقة، بلا تقييمات مفتعلة، بلا أرقام غير قابلة للإثبات.**
5. **Action:** CTA مكرر أسفل الصفحة (احجز / تحدث) + مشاركة + QR (أدوات الطبيب
   نفسها تصبح proof: "انضم لعيادات تعمل بنظام ذكي").

### 11.2 الـLanding = Acquisition Surface الأساسية (ثابت)

اللاندينج الحالية هي **سطح الاكتساب الرسمي للمنصة** — **لا تُنشأ Landing
Page ثانية** إلا بسبب قوي ومبرر بقرار المالك. أي Proof / Trust / Growth
sections مقترحة لها تُصاغ كجزء من **PP-8 UX Strategy** (بنفس هرم §11.1)،
**ولكنها توثيق استراتيجي فقط في هذه المرحلة — لا تنفيذ الآن**؛ أي تنفيذ
مستقبلي يكون بمرحلة صريحة منفصلة (راجع PP-8E) وبموافقة المالك.

### 11.3 Trust signals (المسموح فقط)

- أن البيانات حية من نظام عيادة حقيقي (الخدمات/الساعات محدثة).
- مؤشر "الاستقبال الذكي متاح الآن" مقيّد بالحقيقة (توفر المسار العام).
- هوية المنصة في footer (حلقة النمو) بأمانة: "تعمل بواسطة AI-Receptions".
- **ممنوع:** عدادات "X مريض سعيد"، شهادات مختلقة، ضمانات نتائج.

### 11.4 CTA strategy

| CTA | الصفحة | التسلسل |
|---|---|---|
| Primary: "احجز موعدًا" | كل صفحات الظهور العام | دائمًا أعلى + أسفل؛ لون accent واحد (نمط teal القائم) |
| Secondary: "تحدث مع الاستقبال" | بجانب Primary | outline/border (نمط 15D القائم) |
| Tertiary: اتصال (إذا show_phone) | هيدر/فوتر | لا يزيح الحجز |
| للمشترك المحتمل: "ابدأ الآن / شاهد صفحتك" | اللاندينج | يقود للتسجيل القائم — لا مسار اشتراك جديد |

**قاعدة:** CTA واحد primary لكل شاشة. لا زحام. على الجوال: sticky CTA سفلي
بعد أول تمرير.

### 11.5 Conversion funnel (للمريض)

```
Discovery/QR/Share → Landing on public profile (≤3s فهم)
→ تصفح خدمات/ثقة → CTA → /book (self-serve) أو /chat (AI)
→ حجز مؤكد في نظام العيادة (tenant) → قيمة للطبيب
```
مؤشرات قياس مقترحة (read-only، لاحقًا): زيارات صفحة عامة → نقرات CTA → حجوزات
منسوبة. **القياس نفسه خارج نطاق V1** (توثيق فقط — لا analytics جديدة الآن).

---

## 12. INFORMATION ARCHITECTURE

```
/                          اللاندينج (قائمة) + قسم Growth/Proof (PP-8 إضافة)
/discover                  الدليل العام (بحث/فلاتر: اسم، تخصص، مدينة، نوع)
/c/[slug]                  صفحة العيادة العامة (15D CLOSED — سلوكها الحالي لا يتغير)
/d/[providerSlug]          صفحة الطبيب العامة (جديد — additive)
/book?slug=                حجز عام (قائم — لا تغيير)
/chat?clinic=              محادثة عامة (قائمة — لا تغيير)
/q/[publicId]              QR redirect (قائم؛ يمتد لروابط الطبيب مستقبلًا)
/dashboard/*               لوحة العيادة (قائمة) + إدارة الظهور العام (جديد داخل الإعدادات)
/portal/*                  Patient Portal (PP-1/2 قائم — خارج PP-8 تمامًا)
sitemap.xml · robots.txt   مولّدة (جديد)
```

قواعد: لا مسارات جديدة فوق `/dashboard` إلا داخل صفحة الإعدادات القائمة
(إدارة الظهور = قسم جديد فيها، لا route tree جديد)؛ كل المسارات العامة
server-rendered (نمط `app/c/[slug]/page.tsx`).

---

## 13. PRODUCT MESSAGING FRAMEWORK

### Core Promise
> "عيادتك تستقبل وتحجز وتظهر للمرضى — حتى وأنت في العيادة تعمل."

### Pain Categories (فئات الألم)
1. **الوقت المختلس:** مكالمات وأسئلة متكررة تعطّل العمل الطبي.
2. **الغياب الرقمي:** لا وجود فعلي في Google/السوشيال → مرضى يذهبون لغيرك.
3. **الفوضى:** مواعيد ضائعة، دفاتر، تذكيرات ذهنية.
4. **العمى التشغيلي:** لا أحد يقيس أداء العيادة أو الاحتفاظ بالمرضى.

### Value Pillars (خُلاصة القيمة — مرتبطة بقدرات CLOSED)
- **Operate:** استقبال AI 24/7 + حجز ذاتي (Public Chat/Booking).
- **Be Found:** صفحة عامة + QR + SEO + Discovery (PP-8).
- **Grow with Insight:** Financial & Growth Intelligence (PP-5/PP-7).

### Emotional Positioning
- نبرة: مطمئنة، مهنية، قريبة — "شريك تشغيلي" لا "أداة".
- عبارات مرشحة (تُقرر في التنفيذ): "استقبالك لا ينام" · "صفحتك جاهزة، والمرضى
  يجدونك" · "ركّز على عملك الطبي — نحن ندير الباقي".

### Conversion Message (لماذا الآن؟)
- عرض Founding قائم فعلًا (foundings slots + سعر مؤمّن — بنية موجودة) →
  الرسالة: "انضم للدولة الأولى قبل اكتمال المقاعد" — **بدون** اختلاق إلحاح
  زائف؛ الأرقام من النظام الحقيقي (`/api/landing/founding-slots`).

### Trust Message (لماذا يثق؟)
- بيانات حية لا صفحات ثابتة · RLS/عزل من tenant لمستوى production ·
- لا وعود بأتمتة غير مبنية · صفحات عامة تتطابق مع ما سيراه المريض فعلًا.

**قاعدة لغة صادقة:** كل claim في الرسائل يجب أن يشير إلى قدرة CLOSED
قابلة للإسناد (قائمة §5).

---

## 14. SUBSCRIBER ACQUISITION VS PATIENT EXPERIENCE (فصل صريح)

```
【 Subscriber Acquisition / Growth — عالم PP-8 】
Doctor/Clinic → اللاندينج/الإثبات → Subscription → تفعيل الظهور العام
→ Public Profile + Discovery + SEO → جلب مرضى جدد → Retention/Referral

【 Patient Service — عالم قائم، لا يُلمس 】
Patient → /c · /d · /discover → /book أو /chat → موعد/محادثة
→ (بوابة المريض القائمة /portal لأصحاب المواعيد — PP-1/PP-2)
```

**PP-8 MUST NOT become a Patient Treatment Tracking Portal.**

جدول الفصل:

| | Marketing Profile (PP-8) | Public Discovery (PP-8) | Private Patient Portal (قائم) | Clinical Records (قائم) |
|---|---|---|---|---|
| الجمهور | الجمهور العام | الجمهور العام | مريض موثق فقط | طاقم العيادة |
| البيانات | allow-list عام opt-in | projection عام | مواعيد المريض نفسه | كامل السجل |
| الفهرسة | حسب نموذج الرؤية | indexable | noindex + session | لا وجود عام |

الطبيب لا يرى في PP-8 أي أداة تتبع علاجي، والمريض لا يرى في PP-8 أي بوابة
حساب — الفصل معماري وسلوكي، ويعاد تأكيده في Acceptance Criteria.

---

## 15. MOBILE UX PRINCIPLES

- **Mobile-first حرفيًا:** أغلب زوار الصفحات العامة سيأتون من QR/واتساب.
- أهداف لمس ≥44px · CTA بارز دون تمرير · خط أساس ≥16px · تباين عالٍ (نمط
  dark/stone الحالي).
- **Performance كقيمة:** الصفحات server-rendered، صور محسّنة، بدون أوزان
  جديدة بلا مبرر — بطء الصفحة = خسارة حجز.
- sticky CTA بعد التمرير · أرقام الهاتف `dir="ltr"` قابلة للنقر (نمط 15D).
- لا popups/interstitials — تدمّر الثقة والـSEO معًا.

## 16. ARABIC / ENGLISH / FRENCH READINESS

- **الواقع الحالي:** UI عربي RTL (كل الصفحات العامة `dir="rtl"`) — D7 يعتمد
  i18n كطبقة مستقبلية **قبل التوسع الخليجي** وليس ضمن كل مرحلة.
- **PP-8 commitment:** كل نصوص PP-8 الجديدة تُكتب **قابلة للطبقة i18n**
  (مفاتيح/مصدر واحد للنصوص، لا نصوص عربية مشتتة في JSX) بحيث لا تتطلب
  الترجمة إعادة بناء.
- **V1 ships Arabic-first.** الفرنسية والإنجليزية = جاهزية بنيوية (بنية النصوص)،
  لا ترجمة فعلية في V1 (ما لم يقرر المالك خلاف ذلك).
- المحتوى الذي يدخله الطبيب (bio/وصف) لغته حرة — الصفحة تعرضه كما هو.

---

## 17. PRIVACY / VISIBILITY MODEL

1. **Deny-by-default على كل مستوى** (المبدأ المثبت في `clinicPublicProfile.ts`):
   لا يظهر شيء عام إلا بحقل flag صريح `=== true` (نمط `readFlag` القائم).
2. **Opt-in متدرج (على إضافات PP-8 — لا يمس `/c/[slug]` القائمة):**
   - تفعيل الظهور في Discovery / صفحة طبيب عامة → قرار owner/admin (additive).
   - الفهرسة (Public + Indexable) → قرار منفصل.
   - نشر طبيب بعينه → قرار منفصل لكل provider.
   - الهاتف/الأسعار → flags القائمة (`show_phone`, `show_prices` + `price_visible_to_patients`).
3. **Opt-out فوري:** إلغاء أي flag يزيل الظهور من Discovery وsitemap وrobots
   فورًا (الصفحات server-rendered dynamic — لا كاش طويل للصفحات العامة).
4. **لا بيانات خاصة تقترب من الطبقة العامة:** projection عام منفصل للطبيب
   (نظير `getPublicClinicProfile`) — يُبني بنفس النمط: allow-list حصري،
   ولا حقول جديدة تصل للعام دون وجودها في هذا الملف الموثق.

## 18. TENANT ISOLATION REQUIREMENTS

- Clinic يبقى الـtenant الوحيد (Decision Log §20). صفحة الطبيب العامة تُشتق
  دائمًا عبر `clinic_id` المحلول server-side — **لا** معرّفات يثق بها العميل.
- كل استعلام للطبقة العامة يقيد بـ`clinic_id` المُحلل + `deleted_at is null`
  (نمط 15D: cross-tenant guard مختبر).
- `resolvePublicClinic` يبقى الـresolver المركزي (يدعم id/slug/publicId) —
  لا resolver موازٍ.
- RLS لا يتأثر: الطبقة العامة تقرأ عبر service-role **بعد** الحل الصريح
  للكيان العام (نفس النمط القائم في `/api/booking/*` و`/api/public/*`)،
  وكل مسارات الإدارة (تعديل بيانات الظهور) خلف `authorizeClinicRequest`
  + RBAC (owner/admin فقط للتفعيل).
- IDOR: لا توجد أي نقطة عامة تُقبل فيها معرفات حساسة؛ slug/slug العام فقط.

## 19. EXISTING-SYSTEM REUSE (لا مصدر حقيقة جديد)

| القدرة المطلوبة | يعاد استخدامها كما هي |
|---|---|
| حل الكيان العام | `resolvePublicClinic` (clinics.ts) — المصدر الوحيد |
| بيانات صفحة العيادة | `getPublicClinicProfile` — تمتد/تُوظف، لا تُستبدل |
| صفحة العيادة | `/c/[slug]` (page.tsx) — تحسينات داخلية فقط |
| QR | `/q/[publicId]` + `clinicQr.ts` — يمتد لروابط جديدة بنفس النمط |
| الحجز | `/book?slug=` + `/api/booking/*` — صفر تغيير |
| المحادثة | `/chat?clinic=` + `/api/public/ai/messages` — صفر تغيير |
| الاشتراك/الحدود | `billing_plans` + `subscriptions` + entitlements (15B/15C) — تفعيل الظهور العام يمكن ربطه لاحقًا كـentitlement بلا بنية جديدة |
| الإدارة | `authorizeClinicRequest` + RBAC القائم |
| RBAC/RLS/Tenancy | كما هي حرفيًا |

**Additive فقط:** أي بيانات جديدة (§20) تُضاف بحقول/أعمدة nullable أو JSON
ضمن `settings` الحالي (نمط settings flags) — لا تعديل جداول قائمة ولا كسر
backward compatibility (قاعدة Production Data Safety §4).

## 20. DATA REQUIREMENTS (توثيق فقط — لا تنفيذ في هذه الجولة)

الحد الأدنى من additive changes المرشحة (تُعتمد/تُرفض عند التنفيذ):

1. **على مستوى العيادة (بنمط settings الحالي — additive فقط):**
   - `settings.public_profile.discovery_enabled: boolean` (افتراضي غائب =
     خارج Discovery) — **لا يمس سلوك `/c/[slug]` القائم إطلاقًا**
   - `settings.public_profile.description` (موجود أصلًا في 15D — يُعتمد رسميًا
     كما هو، بلا تغيير)
   - أي فهرسة/visibility إضافية للصفحة القائمة تُؤجل لتغيير additive مستقبلي
     مبرر بقرار مالك — ليست في نطاق V1
2. **على مستوى Provider (أعمدة nullable additive أو كائن marketing منفصل —
   يُحسم في مرحلة التنفيذ):**
   - `public_slug` (فريد، مستقر)
   - `public_visibility` (private / noindex / indexable — deny-by-default)
   - `specialty` · `bio` · `photo_url`
3. **غير مطلوب في V1:** جداول reviews، جداول ranking، جداول analytics،
   أي تعديل على appointments/patients/conversations/financials.
4. **قاعدة:** كل إضافة تُرافقها استراتيجية rollback (drop column / حذف flag)
   وتُوثق في migration header كما هو معتاد في المشروع.

---

## 21. FUTURE EXTENSIBILITY (بعد PP-8 — مسجل، غير مُبنى)

- توسيع أنواع الكيانات في الـDirectory والنموذج العام عبر `entity_kind`:
  **Doctor → Dental Clinic · Dental Center · Radiology / Imaging Center ·
  Specialist · Medical/Dental entities أخرى مناسبة** — التصميم لا يحصر
  النموذج معماريًا في Doctor (قاعدة §9.4).
- Ranking حقيقي بإشارات قابلة للشرح (اكتمال الملف، سرعة الاستجابة، التوفر).
- تقييمات/reviews موثقة الهوية (تحتاج بنية منع إساءة — مرحلة مستقلة).
- لغات إضافية عبر طبقة i18n (D7) — الترجمة الفعلية بلا DB impact.
- Subdomain/custom-domain لصفحات العيادة (البنية الثلاثية الموثقة في
  header of `/c/[slug]`: MAIN_DOMAIN → subdomain → custom domain عبر نفس
  الـresolver) — قرار مالك، خارج V1.
- ربط الظهور العام كـentitlement مدفوع (خطط أعلى = فهرسة/ظهور أوسع).
- ربط `leads` القائم بزوار الصفحات العامة (source tracking) في مرحلة لاحقة.

## 22. EXPLICIT OUT-OF-SCOPE (PP-8 لا تشمل — موثق صراحة)

1. **Patient Treatment Portal** — بوابة علاجية/متابعة علاج (قائم PP-1/PP-2 ولا يمتد هنا).
2. **أي أفعال مالية ذكية/تلقائية** من طرف AI (لا حجز مالي، لا accounting actions).
3. **تغييرات accounting/ledger** — لا kinds جديدة، لا تعديل ledger قائم.
4. **إعادة تصميم subscription/billing** — `billing_plans`/Stripe كما هي؛
   (ربط entitlement مستقبلي فقط).
5. **مدفوعات مريض→طبيب داخل PP-8 أو عمولات Marketplace** (Payments موجودة
   في سياقات أخرى مغلفة: PP-3 portal — لا تمتد هنا).
6. **منصة إعلانات (ads platform) / sponsored listings / حملات SEO مدفوعة.**
7. **Forecasting/تخمين أرقام** (نفس صرامة PP-7: no fabricated numbers).
8. **ذكاء تشخيص/علاج طبي** (safety boundaries القائمة لا تُلمس).
9. **كشف أي بيانات مرضى/محادثات/سجلات علاجية** في أي طبقة عامة.
10. **معاملات marketplace معقدة** (escrow، عروض، مزادات، مطابقة عرض/طلب).
11. **Reviews/testimonials** في V1 (بلا بنية منع إساءة).
12. **Analytics جديدة لقياس الصفحات العامة** (تُوثق مؤشرات §11.5، تنفيذ لاحق).
13. **تغيير مسارات/سلوك `/book`, `/chat`, `/portal`, dashboard التشغيلي القائم.**
14. **Custom domains/subdomains** (توثيق فقط).
15. **WhatsApp/Telegram/Voice channels** — خارج النطاق (Roadmap مستقل).
16. **إعادة تصميم/تغيير سلوك `/c/[slug]` أو Public Clinic Profile القائم
    رجعيًا** — ما أُغلق في 15D يبقى كما هو؛ أي تعديل مستقبلي يكون additive
    ومبررًا بقرار مالك مستقل.
17. **إنشاء Landing Page ثانية** — اللاندينج القائمة هي سطح الاكتساب الرسمي
    (§11.2)؛ مقترحاتها تبقى توثيقًا استراتيجيًا في هذه المرحلة.

---

## 23. ACCEPTANCE CRITERIA (معايير قبول المرحلة عند تنفيذها لاحقًا)

### الأمان/الخصوصية (قابلة للفحص آليًا)
- AC-1: أي كيان PP-8 جديد (مثل صفحة الطبيب) افتراضيًا = Private: أي محاولة وصول عام → 404، غير موجود في Discovery/sitemap.
- AC-2: لا صفحة طبيب عامة بدون opt-in صريح من owner/admin، و`provider_type='staff'` لا يُنشر أبدًا.
- AC-3: جرد HTML للصفحات العامة لا يحوي: patient/conversation/subscription/phone(opt-out)/email طبيب/user_id (نمط فحص 15D الحي).
- AC-4: كل استعلام عام مقيّد بـ`clinic_id` المُحلل server-side + `deleted_at is null`؛ اختبار cross-tenant يثبت العزل.
- AC-5: إلغاء أي opt-in يزيل الظهور من Discovery وsitemap وrobots فورًا.

### الوظيفة
- AC-6: `/discover` تعرض فقط Public كيانات فعّالة الاشتراك، بحث اسم/تخصص/مدينة يعمل، pagination يعمل، empty state صادق.
- AC-7: صفحة الطبيب العامة تعرض allow-list §8.1 فقط، وCTA الحجز/المحادثة تعمل عبر المسارات القائمة حرفيًا.
- AC-8: sitemap.xml يحوي كيانات opt-in القابلة للفهرسة فقط (إضافات PP-8)؛ robots يطابق نموذج الرؤية لتلك الإضافات — **بلا تغيير robots للصفحات القائمة خارج النطاق**.
- AC-9: canonical صحيح + روابط بديلة تُحوَّل إلى slug القنوني + JSON-LD صالح.
- AC-15: **اختبارات 15D القائمة (clinic-public-profile · clinic-public-page · clinic-qr · clinic-q-redirect) تمر دون أي تعديل** — دليل قياسي على صفر كسر للسلوك المغلق.

### الجودة (بوابات المشروع القياسية)
- AC-10: `tsc --noEmit` = 0 · vitest كامل PASS · `npm run build` PASS · lint بلا أخطاء جديدة.
- AC-11: اختبارات PP-8 جديدة تغطي: visibility matrix (private/noindex/indexable)، projection الطبيب، Discovery، sitemap/robots، عزل tenant.
- AC-12: صفر تعديل على: booking/chat/portal/accounting/subscription logic · صفر migrations غير additive.
- AC-13: RTL سليم + لا نصوص عربية مبثوثة غير قابلة للطبقة i18n (مراجعة كود).
- AC-14: أي migration مضافة آمنة/قابلة للتراجع ومطبقة idempotent (نمط المشروع).

## 24. RECOMMENDED IMPLEMENTATION PHASES (لما تُعتمد المواصفة)

- **PP-8A — Provider Visibility Foundation:** نموذج الرؤية الثلاثي للإضافات
  الجديدة (حقول الطبيب العامة + robots/noindex) + قسم إدارة الظهور في
  dashboard — **`/c/[slug]` وPublic Clinic Profile القائم لا يُمسان إطلاقًا.**
  أصغر قطعة قيمة، لا شيء جديد للعام.
- **PP-8B — Public Doctor Profile:** additive provider marketing fields + projection + `/d/{slug}` + إدارة الopt-in.
- **PP-8C — SEO Foundations:** sitemap.xml + robots.txt مولّدان + JSON-LD + OG كامل + canonical consolidation.
- **PP-8D — Discovery V1:** `/discover` بسيطة (بحث/فلاتر/pagination) بقراءة projection العام فقط.
- **PP-8E — Growth Polish:** أدوات مشاركة/QR للطبيب + تنفيذ مقترحات
  Proof/Trust في اللاندينج (**اختياري — يتطلب موافقة مالك منفصلة صريحة**)
  + i18n readiness sweep.

كل مرحلة تُفتح بأمر صريح من المالك وتُغلق ببوابات AC-10/12/14 (نمط PP-1→PP-7).

---

## الحالة النهائية

**PP-8 PRODUCT/UX SPECIFICATION = DRAFT / READY FOR OWNER APPROVAL**

لم يُنفَّذ أي شيء في هذه الجولة: لا code، لا migrations، لا UI، لا routes،
لا tests، لا build، لا تعديل `PROJECT_STATUS.md`. إنشُئ هذا الملف فقط.
