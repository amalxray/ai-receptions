# PRE_PRODUCTION_CHECKLIST.md — FINAL GATE قبل FIRST REAL PATIENT

> 2026-08-24 · PASS = مُثبت بدليل · BLOCKED = يحتاج بيئة/قرار · NEEDS USER ACTION = إعداد خارجي لا يمكن من الكود.
> **BLOCKED ≠ PASS.**

## CRITICAL
| البند | الحالة | الدليل / المطلوب |
|---|---|---|
| Tenant isolation / RLS | **PASS** | اختبارات عدائية (403/empty عبر العيادات) + فحوص RLS |
| Booking double-book | **PASS** | DB constraint + tests + E2E سابقة |
| Stripe webhook = source of truth، idempotent | **PASS** | TEST E2E حي + reliability tests |
| AI failure fallback + handoff | **PASS** | orchestrator fix + tests |
| Secrets خارج client bundle | **PASS** | فحص NEXT_PUBLIC + audit logs بلا secrets |
| Destructive migrations | **PASS (لا وجود لها)** | grep شامل — كلها additive |
| Error leaks للمستخدم | **PASS** | تنظيف details + health test يمنع التسريب |
| Supabase Backups/PITR مفعّلة | **NEEDS USER ACTION** | API: `pitr_enabled=false`, `backups=[]`. فعّل من Dashboard → Database → Backups (يتطلب Pro لـPITR) |
| Restore drill مُختبر | **BLOCKED** | يتطلب مشروع Staging منفصل أولاً |

## HIGH
| البند | الحالة | ملاحظة |
|---|---|---|
| Health endpoint للمراقبة | **PASS** (كود) + **NEEDS USER ACTION** (ربط UptimeRobot) | `/api/health` |
| Dependency vulnerabilities | **PARTIAL** | أُصلح المتاح آمناً؛ `next` 14→16 ترقية major مجدولة (CVE DoS self-hosted فقط — Vercel غير متأثر بالمسار) |
| Staging environment | **BLOCKED** | يتطلب مشروع Supabase ثانٍ + Vercel preview env (خطوات موثقة في PROJECT_STATUS) |
| Load test | **BLOCKED** | بعد staging فقط |
| RBAC Owner≠Doctor≠Staff | **PASS** | owner-only membership عند التسجيل + authorizeClinicRequest على كل routes |
| Rate limiting حرج (AI/register) | **PASS** | limiter موجود + bounded memory test؛ توسعة لباقي endpoints = P2 |

## MEDIUM
- Data lifecycle/export: schema يدعم soft-delete وaudit_logs في كل الجداول الحرجة — التصميم لا يمنع export لاحقاً. **PASS (تصميمياً)**
- Feature flags: غير موجودة — قرار مؤجل؛ نقطة الدخول المقترحة `clinics.settings.features` (jsonb) بلا migration الآن. **مؤجل**
- Mobile/RTL: الواجهات RTL-native (dir=rtl) وتستخدم grids متجاوبة. مراجعة بصرية يدوية موصى بها. **PASS جزئي**

## LOW
- Sentry/error tracking اختياري.
- Cursor pagination لقوائم admin الكبيرة (عند >10k صف).

---

# MONITORING SETUP (USER ACTION REQUIRED — خطوات دقيقة)
1. **UptimeRobot:** monitor نوع HTTP(s) على `https://<domain>/api/health` كل 5 دقائق → alert email عند non-200.
2. **Vercel Analytics/Monitoring:** فعّل من Project → Observability (متاح بالخطة المجانية) لـ latency/5xx.
3. **Alerts thresholds مقترحة:** health fail ×2 متتالية · 5xx > 2% خلال 5 دقائق · webhook failures > 0 (أي فشل توقيع يستحق نظرة) · p95 latency > 3s · AI failure rate > 10%.
4. **Sentry (اختياري):** `npx @sentry/wizard@latest -i nextjs` — لا يفعَّل من هنا.

# STAGING SETUP (USER ACTION REQUIRED — خطوات دقيقة)
1. أنشئ مشروع Supabase جديداً (منطقة قريبة) → شغّل `supabase/migrations/*.sql` عليه بالترتيب.
2. Vercel: أنشئ Preview Environment بمتغيرات staging (Supabase staging URL/keys + Stripe **TEST** keys + Gemini key منفصل).
3. ممنوع منعاً باتاً: production credentials في staging أو العكس.
4. بعدها: Restore Drill (backup production → restore في staging → مقارنة counts/FK/RLS).

---

# PRODUCTION GO / NO-GO

## القرار: **NO-GO (مؤقت)** — حتى إتمام بندين فقط:

1. **تفعيل Backups (ويفضل PITR)** من Supabase Dashboard — الدليل الحالي: `pitr_enabled:false, backups:[]`.
2. **Restore Drill ناجح على Staging** يثبت استعادة clinics/patients/appointments/subscriptions/audit.

كل ما عداه (code, isolation, booking, billing, AI, security hygiene, build/tests 508+) **GO**.

بعد إتمام البندين والتحقق، القاعدة تتحول تلقائياً إلى **GO** دون أعمال كودية إضافية.

## اقتراحات مُكيَّفة من أنظمة SaaS الكبرى (بلا تعقيد)
- **Stripe-style idempotency keys** لكل POST حساس مستقبلاً (payments/refunds) — البنية (unique constraints) جاهزة.
- **Shopify-style changelog/audit-first**: أي تغيير settings يسجل who/what/before/after في audit_logs — البنية موجودة، وسّع التغطية تدريجياً.
- **AWS-style kill switch**: flag واحد في env يعطل AI chat فوراً عند طوفان تكاليف (`AI_DISABLED=true`) — تنفيذ P2 بسيط.
