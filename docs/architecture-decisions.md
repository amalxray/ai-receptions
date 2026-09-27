# STEP 5 — Locked Architectural Decisions (Must-Design-Now)

## Status: LOCKED — Owner-approved (documentation only; zero code/migration/RLS/RBAC changes)

> المصدر: تقرير **STEP 4 — Product & Architecture Expansion Audit** المعتمد.
> هذه القرارات **مبادئ ملزمة** لأي مرحلة قادمة (Accounting B/C · Localization · Insurance · Payroll · Growth · AI).
> أي توسعة مستقبلية يجب ألا تجبر إعادة بناء Phase A أو كسر أي مبدأ أدناه.

---

## D1 — Payer Attribution (Patient ≠ Payer)

- **المبدأ:** المريض هو صاحب الخدمة الطبية، وليس بالضرورة جهة الدفع.
- **النموذج المعتمد:** `payer_type` (patient | insurance | employer | third_party) + `payer_ref` كحقول **nullable additive** على المدفوعات/الـledger — تُدمج في **Accounting Phase B** (وليس بعد).
- **النتيجة المالية:** patient balance يبقى **الحقيقة النهائية** (claim rejection يعيد المسؤولية للمريض).
- **ممنوع:** افتراض patient=payer ضمنيًا في أي كود مالي جديد.

## D2 — Organization Layer (Multi-location)

- **المبدأ:** **Clinic = نطاق البيانات التشغيلي الدائم** — لا يتغير أبدًا.
- **النموذج المعتمد:** `organizations` كطبقة تجميع/صلاحيات/franchise **فوق** العيادات، additive لاحقًا (`clinics.organization_id` nullable + org-admin RBAC). لا يغيّر أي جدول قائم ولا نماذج العزل.

## D3 — Country / Currency Profile (country-agnostic)

- **المبدأ:** **Language ≠ Country ≠ Currency ≠ Tax system ≠ Payment methods ≠ Fiscal year.**
- **النموذج المعتمد:** `country_profiles` + `clinic_settings` (currency, timezone, date/number format, tax rules, invoice numbering rules, fiscal year) — مرحلة **Localization Foundation** مقدَّمة قبل Payroll. عملة واحدة لكل عيادة (النمط السائد في الأنظمة الناضجة).
- **الأسواق المستهدفة:** فلسطين · الأردن · السعودية (ZATCA/VAT) · الكويت · الإمارات — كلها قابلة للتكوين، لا hardcode.

## D4 — Ledger Kind-Dictionary Policy

- **المبدأ:** `financial_transactions` لا يتحول إلى جدول polymorphic فوضوي.
- **القاعدة الإلزامية:** كل نوع حركة مالي جديد (expense · payroll · claim · write-off · discount · fee …) = **`transaction_kind` موثق في dictionary + migration additive + توثيق**، لا أعمدة ad-hoc ولا JSONB حر بلا schema منطقي.

## D5 — Provider Attribution (أساس Payroll/عمولات)

- **المبدأ:** الطبيب المسؤول عن الخدمة مرجع اختياري (nullable) على الحركات المالية/البنود — يُثبَّت في Phase B.
- **السبب:** عمولات الإنتاج (نسبة من إيراد الطبيب) نمط Payroll القياسي في العيادات؛ بدونه سنتوقف عند أول حساب عمولة.

## D6 — Channel Abstraction (Communication/AI)

- **المبدأ:** الـAI والقنوات **لا تُربط بقناة واحدة**. المحادثات تكتسب `channel` صريحًا (web/whatsapp/sms/email/telegram/voice) عبر adapter layer — القناة قابلة للتبديل بلا إعادة بناء الـAI.
- **شرط الـAI:** AI Clinic Operating Assistant (مستقبلًا) يصل للبيانات (appointments/FT/balances/utilization) **حصرًا عبر APIs مُصرَّح بها** بنفس RBAC — لا bypass مالي.

## D7 — i18n Principle

- **المعتمد:** UI عربي الآن + i18n layer كمتطلب مستقبلي (قبل التوسع الخليجي بلا DB impact).

## D8 — Roadmap المعتمد (بعد Phase A CLOSED)

```
Phase A (CLOSED) → STEP 5 (this doc) → Accounting Phase B (Receivables/Aging
+ payer attribution + discounts + write-offs) → Phase C (Expenses/Cash closing)
→ Localization Foundation → Insurance Foundation (payers/coverage/claims skeleton)
→ Payroll Foundation (provider attribution) → Financial Reporting (P&L/Cash Flow/Aging)
→ Growth Layer (Recall/No-show recovery/Waitlist) → Patient Portal + Online Payments
→ Financial Intelligence → AI Clinic Operating Assistant
```

## D9 — Healthcare Network Design-Now / Build-Later (Owner-approved 2026-09-02)

> **Status: DESIGN-NOW PRINCIPLES ONLY — zero implementation.** تُثبَّت هذه المبادئ
> الآن لتوجيه أي كود قادم (خصوصًا PP-8C/PP-8D) وتمنع إعادة بناء مستقبلية.
> Healthcare Network نفسه = **Deferred / Future phase** تُفتح بأمر مالك منفصل.

### المبدأ التأسيسي
`Professional Identity → Trusted Relationship → Patient-scoped Collaboration`
— الشبكة تربط **كيانات مشتركة نشطة فقط** في المنصة (عيادات · أطباء · مراكز تصوير ·
مخابر أسنان — عبر `entity_kind`، انظر PP-8 spec §9.4/§21).

### المبادئ الملزمة الأربعة (تُطبق على أي كود قادم)

1. **Network participation requires active subscription/membership.** لا كيان غير
   مشترك/نشط يدخل الشبكة أو الدليل — نفس مبدأ Discovery opt-in (PP-8)؛ الـgating
   عبر Entitlements لاحقًا.
2. **Trusted professional relationship does NOT grant patient-data access across
   tenants.** العلاقة المهنية بين كيانين لا تنقل أو تفتح أي بيانات مريض بذاتها —
   صفر قراءة عبر حدود tenant (RLS/clinic_id) بدون explicit request.
3. **Patient collaboration/exchange must be strictly Case/Order-scoped.** كل تبادل
   بيانات مربوط بـCase/Order identity (معرّفات مستقرة مستقلة) — **ممنوع** الاعتماد على
   اسم المريض أو clinic-local patient ID كهوية أساسية عبر المؤسسات.
4. **Public visibility of professional relationships is explicit opt-in by BOTH
   parties.** وجود علاقة شبكة لا يظهر في أي صفحة عامة (`/d/`, `/c/`, `/discover`)
   إلا بموافقة الطرفين معًا.

### قيود توجيهية للمراحل الجارية (PP-8C/8D)
- أي Discovery/entity projection جديد يبني على **`entity_kind` abstraction** — لا
  افتراض أن الكيانات محصورة في doctors/clinics.
- لا تصلّب أي تصميم جديد على افتراض provider↔clinic واحد ما لم يتطلبه نطاق المرحلة
  (الهوية المهنية متعددة الانتماءات = مؤجلة مع D2 organizations layer).

### Deferred / Future (تصميمها الآن = تخمين؛ لا تُبنى ضمن D9)
- Relationship schema · case/order workflows · DICOM/report exchange ·
- cross-tenant RBAC · dental-lab workflows · collaboration UI ·
- inter-provider billing · **actual Healthcare Network implementation**.

### شرط الفتح
Implementation مستقبلي للشبكة = **مرحلة مستقلة بأمر مالك صريح**، مشروطة بوجود
مشتركين حقيقيين وبقرار معلن بفك الـdeferral المقصود لـDICOM/Case identity
(DO-NOT-BUILD-YET — STEP 4 §13).

## DO-NOT-BUILD-YET (مُثبَّت من STEP 4 §13)

Double-entry كامل · Claims engine كامل · Online patient payments/Stripe للمريض · Inventory/POs · DICOM/Imaging · Multi-currency فعلية · Patient portal/Forms/Consent · Voice AI · Franchise dashboards — بكل شرط "متى يصبح منطقيًا" الموثق في تقرير STEP 4.

---
