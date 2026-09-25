# المعمارية — كيف يعمل المشروع تقنيًا؟

## الستاك

Next.js 14 (App Router) + Supabase (Postgres + Auth + RLS) + Vercel (استضافة + نطاقات).
الاختبارات: vitest. البناء: `npm run build`.

## التوجيه (middleware)

ملف واحد `middleware.ts` يفعل ثلاثة أشياء بالترتيب:

1. **تحويل 301** للروابط القديمة نحو النطاق الفرعي (بوابة مزدوجة: الوجود + الجاهزية).
2. **إعادة كتابة (rewrite)** جذر المستأجر `https://{slug}.dentairec.com/` ← `/{slug}` (الجذر فقط).
3. تحديث جلسة Supabase ثم حارس `/admin/*`.

## طبقة النطاقات (`lib/vercel/`)

| الوحدة | الدور |
|---|---|
| `domains.ts` | الرياضيات النقية (slug/host) + عميل Vercel API |
| `subdomainReadiness.ts` | قراءة قائمة النطاقات (كاش 60s، Edge-safe) |
| `tenantLinks.ts` | بناء الرابط حسب الجاهزية (فرعي أو `/c/{slug}`) |
| `tenantLookup.ts` | فحص وجود الـslug (مهلة 4s، fail-open) |

## الخدمات المفتاحية (`lib/services/`)

- `activityPublicSpace.ts` — مساحة العيادة العامة (`pageUrl` + `legacyPageUrl`).
- `clinicPublicProfile.ts` / `clinicPublicConfig.ts` — الملف العام وإعدادات اللوحة.
- `doctorPublicProfile.ts` — ملف الطبيب (يربط العيادة برابطها القانوني).
- `askPageData.ts` / `askAssistant.ts` — بيانات `/ask` (دفعة واحدة).
- `clinicProvisioning.ts` — حفظ حالة التجهيز في `settings.tenant`.

## لماذا Vercel هو الحَكَم؟

لأن النطاق قد يُحذف يدويًا من Vercel بينما سجل DB ما زال يقول «جاهز».
لذلك قرار التحويل يقرأ **قائمة Vercel الحية**، وDB للعرض فقط.
التفصيل في `04-tenant-identity`، والأساس التشخيصي في `../PHASE1_DIAGNOSTIC_MULTITENANT.md`.
