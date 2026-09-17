# Phase 1 — تقرير تشخيصي (قراءة فقط) لمشاكل الـ Multi-Tenant

> **الحالة:** ✅ **تم التنفيذ** — F1+F2+F3+F5+F6 منفَّذة ومختبرة (هذا التقرير وُلد كتشخيص قراءة فقط ثم تحوّل لخطة تنفيذ معتمدة).
> **التنفيذ:** `lib/services/clinicHours.ts` (مصدر موحّد) + `lib/services/clinicClock.ts` (رياضيات توقيت نقية) + إصلاح `is_active`→`enabled` + توقيت العيادة في كل المسارات + دعم `shifts`/`breaks` في المُجدوِل + حذف حقل الهاتف الميّت. **12 اختباراً جديداً** في `tests/unit/clinic-hours.test.ts` — 0 انحدارات (66 فشلاً سابقاً قبل وبعد على حدٍّ سواء، tsc: 26 خطأً سابقاً قبل وبعد، كلها في اختبارات قديمة خارج النطاق).
> **HEAD:** `322e512` — `fix(ai): resilient failover + stronger backoff + remove legacy booking form`
> **النطاق:** جميع العيادات (Amal X-Ray Center + كل العيادات الحالية والمستقبلية) — إصلاحات عامة لا لكل عيادة.
> **تاريخ:** 2026-09-17

---

## ملخّص تنفيذي

| # | المشكلة | الحالة | السبب الجذري | الملف |
|---|---|---|---|---|
| 1 | AI لا يعرف ساعات العمل | 🔴 **مؤكد** | العمود `is_active` **غير موجود** في `provider_schedules` (الاسم الصحيح `enabled`) | `lib/ai/clinicDataContext.ts:68` |
| 2 | توقيت Asia/Hebron خاطئ | 🔴 **مؤكد** | `new Date().getHours()/getDay()` = توقيت السيرفر (UTC على Vercel) | `clinicDataContext.ts:75-79`، `hours-status/route.ts:50-52` |
| 3 | حقل نموذج في واجهة الشات |  **مؤكد** | `<input type="tel">` بلا state/name ولا يُرسل إطلاقاً (حقل ميت) | `components/chat/ChatInterface.tsx:432-436` |
| 4 | توليد الفترات من provider_schedules | 🟠 **مؤكد جزئياً** | `shifts` (متعدد الورديات) + `breaks` **لا يُقرآن**؛ ومسار الحفظ بالـ UI **لا يكتبهما** | `bookingService.ts:47-56`، `schedule/route.ts:73-84` |
| 5 | `maxDuration` على مسار AI | ✅ **منفَّذ** | `export const maxDuration = 60` | `app/api/public/ai/messages/route.ts:16` |
| 6 | `BACKOFF_MS` | ✅ **منفَّذ** | `[1000, 3000]` مع محاولتين لكل مزوّد | `lib/ai/resilience.ts:26,29` |

---

## السؤال 1 — كيف يُحدَّد الـ Tenant؟ (`tenant_id` أم `slug`؟)

**الجواب: لا وجود لـ `tenant_id` في الكود إطلاقاً.** البحث عن `tenant_id` في 1124 ملفاً أعاد **صفر نتائج**.

المفتاح الفعلي للـ tenant هو **`clinic_id` (uuid)** + **`slug`** على جدول `public.clinics`.

```ts
// lib/services/clinics.ts:65
export async function resolvePublicClinic(params: { id?: string; publicId?: string; slug?: string }): Promise<PublicClinic | null> {
  if (!params.id && !params.publicId && !params.slug) return null;      // :66

  let query = supabaseAdmin
    .from('clinics')
    .select('id, slug, name, latitude, longitude, phone, city, area, address_detail, settings')
    .is('deleted_at', null);                                            // :73

  if (params.id)            query = query.eq('id', params.id);           // :76
  else if (params.publicId) query = query.eq('public_id', params.publicId); // :78
  else                      query = query.eq('slug', params.slug);       // :80
```

**نقاط الدخول:**
- `app/api/public/ai/messages/route.ts:19` — يستقبل `clinic_slug` (اختياري)
- `app/api/public/ai/messages/route.ts:67-68` — `resolvePublicClinic({ id: clinic_id, slug: clinic_slug })`
- `app/api/public/ai/messages/route.ts:126-131` — نفس المنطق لمسار الـ stream
- `app/api/public/clinic/hours-status/route.ts:24-27` — **slug فقط**

**الخلاصة:** كل الاستعلامات التشغيلية مُقيَّدة بـ `clinic_id`. لا تسريب بين العيادات على مستوى الاستعلام — المشكلة في أعمدة/توقيت، لا في العزل.

---

## السؤال 2 — جدول/أعمدة ساعات العمل التي يحفظها الـ UI

**الجدول:** `public.provider_schedules`

**مسار الحفظ:** `app/api/clinic/providers/[providerId]/schedule/route.ts`

```ts
// :8-11 — مخطط التحقق (Zod)
weekday:    z.number().int().min(0).max(6),
enabled:    z.boolean(),
start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'start_time must be HH:MM'),
end_time:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'end_time must be HH:MM'),

// :22-24 — العزل: clinic_id إلزامي من الـ query
const clinicId = searchParams.get('clinic_id');
if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

// :73-84 — الصفوف المكتوبة فعلياً
{ clinic_id: clinicId, provider_id: providerId, weekday: row.weekday,
  enabled: row.enabled, start_time: row.start_time, end_time: row.end_time }
await supabase.from('provider_schedules').upsert(rows, { onConflict: 'provider_id,weekday' });  // :84
```

**⚠️ ملاحظة مهمة:** مسار الحفظ يكتب **5 حقول فقط**. لا يكتب:
- `appointment_duration_minutes`
- `max_appointments_per_day`
- `breaks`
- **`shifts`** ← العمود المضاف في `20260827_dashboard_location_roles_shifts.sql:76-77` لدعم الورديات المتعددة

**إنشاء جدول افتراضي عند إضافة طبيب:** `app/api/clinic/providers/route.ts:82`.

---

## السؤال 3 — مسار قراءة ساعات العمل داخل الـ AI

**الملف:** `lib/ai/clinicDataContext.ts:62-91` — الدالة `loadClinicWorkingHours(clinicId)`

```ts
// :64-69
const { data, error } = await supabaseAdmin
  .from('provider_schedules')
  .select('weekday, start_time, end_time')
  .eq('clinic_id', clinicId)      // ✅ العزل صحيح
  .eq('is_active', true)          // 🔴 العمود غير موجود!
  .order('weekday', { ascending: true });

// :70-73 — عند أي خطأ يُسجَّل الحدث وتُعاد null
if (error) {
  logEvent('clinic_working_hours_error', { clinic_id: clinicId, error: error.message }, 'error');
  return null;
}

// :75-79 — حساب "مفتوح الآن" بتوقيت السيرفر
const now = new Date();
const todayWeekday = now.getDay();
const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const today = days.find((d) => Number(d.weekday) === todayWeekday) ?? null;
const isOpenNow = Boolean(today && currentTime >= today.start_time.slice(0, 5) && currentTime < today.end_time.slice(0, 5));
```

**المُستهلك:** `lib/ai/orchestrator.ts:20` (import) و `lib/ai/orchestrator.ts:241` داخل `Promise.all` مع `loadClinicOperatingData`.

**التشخيص:** `is_active` غير موجود في `provider_schedules` → PostgREST يعيد خطأ العمود → `return null` → **قسم ساعات العمل يُحذف بالكامل من الـ prompt** → الـ AI يجيب "الساعات تحتاج تأكيد" دائماً. هذا هو سبب المشكلة رقم 1.

---

## السؤال 4 — التطابق/الاختلاف بين مسار الـ UI ومسار الـ AI

| البُعد | UI / Badge / الصفحة العامة | AI (`clinicDataContext`) | الحالة |
|---|---|---|---|
| الجدول | `provider_schedules` | `provider_schedules` | ✅ متطابق |
| العزل | `.eq('clinic_id', …)` | `.eq('clinic_id', …)` | ✅ متطابق |
| فلتر التفعيل | **`.eq('enabled', true)`** | **`.eq('is_active', true)`** | 🔴 **متعارض — العمود غير موجود** |
| المرجع الزمني | `new Date().getDay()/getHours()` (سيرفر) | نفس الشيء (سيرفر) | 🔴 كلاهما خاطئ لـ Asia/Hebron |
| دمج عدة أطباء | دمج لكل يوم: أبكر بداية / آخر نهاية | `.find()` — **أول صف فقط** |  لا دمج → ساعات عشوائية |
| الورديات المتعددة | `shifts` غير مقروءة | `shifts` غير مقروءة | 🔴 مهمَل في الطرفين |
| الاستراحات | `breaks` غير مقروءة | `breaks` غير مقروءة | 🔴 مهمَل في الطرفين |
| النتيجة العملية | جدول الساعات يظهر | قسم الساعات **مفقود تماماً** |  عدم تطابق مرئي |

**مصادر الحقيقة الثلاثة المتوازية (تكرار منطق):**
1. `app/api/public/clinic/hours-status/route.ts:30-48` (Badge)
2. `lib/services/clinicPublicProfile.ts:247-268` (جدول الساعات في الصفحة العامة)
3. `lib/ai/clinicDataContext.ts:62-91` (prompt الـ AI)

الثلاثة تنفّذ نفس الدمج بـ `.eq('enabled', true)` — **إلا** الـ AI الذي يستخدم `is_active`. التوحيد في دالة مشتركة واحدة هو الإصلاح الصحيح (multi-tenant/global).

---

## السؤال 5 — محتوى `lib/ai/clinicDataContext.ts` كاملاً (خريطة الملف)

| الأسطر | العنصر | الوصف |
|---|---|---|
| 1-2 | imports | `supabaseAdmin`، `logEvent` |
| 4-14 | docblock | "المصدر الوحيد للحقيقة" — الـ AI يقرأ من الجداول التشغيلية مباشرةً، مُقيَّدة بـ `clinic_id` |
| 16-27 | `type ClinicServiceForAI` | id, name, description, duration_minutes, pricing_type, price, price_min, price_max, price_visible_to_patients, active |
| 29-34 | `type ClinicProviderForAI` | id, name, title, provider_type |
| 36-44 | `type ClinicOperatingData` | services[], providers[], providerServiceIds[], hasServices, hasProviders, usable |
| 46-53 | `EMPTY_OPERATING_DATA` | ثابت فارغ |
| 55 | `ARABIC_DAYS` | `['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']` — الفهرس 0 = الأحد |
| 57-91 | **`loadClinicWorkingHours(clinicId)`** | 🔴 يستخدم `is_active` (غير موجود) + توقيت السيرفر. يُعيد `null` عند الخطأ |
| 62-69 | استعلام الجدول | `.from('provider_schedules').select('weekday, start_time, end_time')` |
| 74-79 | حساب الحالة | `todayWeekday`, `currentTime`, `isOpenNow` |
| 80-86 | القيمة المُعادة | `{ days, todayName, todayWeekday, currentTime, isOpenNow }` |
| 87-90 | catch | `logEvent('clinic_working_hours_exception')` → `null` |
| 93-135 | `loadClinicOperatingData(clinicId)` | `Promise.all` على `clinic_services` (`.eq('active', true).is('deleted_at', null)`)، `providers` (`.is('deleted_at', null)`)، `provider_services` — كلها `.eq('clinic_id', clinicId)` ✅ |
| ~218 | `loadClinicProfile` | يقرأ `settings.timezone` من `clinics.settings` → `timezone: (settings.timezone as string \| null) ?? null` |

**ملاحظة حاسمة:** `timezone` **موجود ومقروء** في `loadClinicProfile` (سطر ~218) ويُمرَّر فعلاً إلى `orchestrator.ts:260` و `:305` للاستخدام في `understanding` و `findEarliestAvailableSlot`. لكن `loadClinicWorkingHours` **لا يستقبله ولا يستخدمه** — وهذا هو مصدر انحراف "مفتوح الآن".

---

## السؤال 6 — طريقة تنسيق الوقت (Intl أم toLocaleString أم يدوي؟)

**الجواب: مختلط — والانحراف في المكان الحساس.**

**أ) حساب "الآن" في السيرفر — يدوي 100% (بلا Intl، بلا timezone):**
```ts
// lib/ai/clinicDataContext.ts:77
const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
// app/api/public/clinic/hours-status/route.ts:52 — نفس السطر حرفياً
```
→ `getHours()` يعيد توقيت **السيرفر**. على Vercel = UTC. الفرق عن `Asia/Hebron`/`Asia/Jerusalem` = **+2/+3 ساعات** ⇒ الـ Badge والـ AI يعطيان "مغلق" بينما العيادة مفتوحة (والعكس).

**ب) الـ Intl موجود لكن في ملف آخر فقط:**
```ts
// lib/ai/understanding.ts:61 — Clinic-local date (YYYY-MM-DD)
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone /* :64 */ });

// lib/ai/understanding.ts:76 — Clinic-local time
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone /* :79 */ });
```
هاتان الدالتان (`dateInTimeZone` / `timeInTimeZone`) مستخدمتان في `lib/ai/availabilityTool.ts:131-132` فقط.

**ج) العرض في الواجهة — يدوي (وهذا صحيح، لأنه wall-clock محلي جاهز من DB):**
```ts
// components/public/ActivitySpaceChrome.tsx:45-53
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return time;
  const h = Number(match[1]); const m = match[2];
  const suffix = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}
```
`start_time`/`end_time` أعمدة `time` في Postgres = ساعة حائط محلية بلا منطقة ⇒ لا تحتاج تحويلاً عند العرض. المشكلة في **مقارنتها بـ "الآن"** فقط.

**توقيت العيادات المخزَّن فعلياً** (من `.restore-drill/prod-full.sql:7003-7005`): `"timezone": "Asia/Jerusalem"` لـ `amal-clinic` و `ahmad-clinic` و `amal x-ray center`. الافتراضي في `clinic_settings.timezone` = `'UTC'` (سطر 3771) مع قيد `is_valid_iana_timezone`.

---

## السؤال 7 — مخطط `provider_schedules` الفعلي

**من الهجرة:** `db/migrations/20260723_appointment_engine.sql:2-14`
**من قاعدة الإنتاج الحقيقية:** `.restore-drill/prod-full.sql:5247-5260`

```sql
CREATE TABLE public.provider_schedules (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                    uuid NOT NULL REFERENCES public.clinics(id)   ON DELETE CASCADE,
  provider_id                  uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  weekday                      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  enabled                      boolean  NOT NULL DEFAULT true,      -- ← الاسم الصحيح
  start_time                   time NOT NULL,                       -- ساعة الحائط، وردية #1
  end_time                     time NOT NULL,
  breaks                       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ← لا يُقرأ في أي مكان
  appointment_duration_minutes integer NOT NULL DEFAULT 30 CHECK (appointment_duration_minutes > 0),
  max_appointments_per_day     integer,
  shifts                       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ← أُضيف 20260827، لا يُقرأ
  UNIQUE(provider_id, weekday)
);
CREATE INDEX provider_schedules_clinic_idx ON public.provider_schedules(clinic_id, provider_id);
ALTER TABLE public.provider_schedules ENABLE ROW LEVEL SECURITY;
-- سياسة: app_user_is_active_clinic_member(clinic_id)
```

**🔴 تأكيد قاطع:** لا يوجد عمود `is_active` — لا في الهجرة ولا في الإنتاج. حقول `shifts` تُحفظ كـ `[{"start":"15:00","end":"20:00"}]` حسب `20260827_dashboard_location_roles_shifts.sql:71-77`، و`start_time`/`end_time` تبقى "المصدر المرجعي للوردية الأولى كي يعمل محرك التوفر الحالي بلا تغيير".

---

## السؤال 8 — `maxDuration` على مسار الـ AI

✅ **موجود ومنفَّذ** (ضمن الكوميت `322e512`):
```ts
// app/api/public/ai/messages/route.ts:16
export const maxDuration = 60;
```
مسارات أخرى بنفس القيمة: `app/api/clinic/messages/upload/route.ts:7`.

---

## السؤال 9 — قيمة `BACKOFF_MS`

✅ **منفَّذ** في `lib/ai/resilience.ts`:
```ts
:26  const MAX_ATTEMPTS_PER_PROVIDER = 2;
:29  const BACKOFF_MS = [1000, 3000];
:100 / :133   for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
:117 / :150     if (attempt < MAX_ATTEMPTS_PER_PROVIDER - 1) {
:118 / :151       await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
```

---

## السؤال 10 — أي مكوّن شات يحتوي حقول نموذج؟ (الاسم/المسار/عدد الحقول)

**النتيجة (عدّ `<input>|<select>|<textarea`):**

| الملف | العدد | التفصيل |
|---|---|---|
| `components/chat/ChatInterface.tsx` | **2** | 1 غير مقبول + 1 شرعي |
| `components/chat/FloatingChatWidget.tsx` | 0 | ✅ نظيف |
| `components/chat/InteractiveReplies.tsx` | 0 | ✅ نظيف |

**الحقل المخالف — `components/chat/ChatInterface.tsx:430-437`:**
```tsx
{aiUnavailable && (
  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
    <p>يمكنك ترك رقم هاتفك هنا وسيتواصل معك فريق العيادة.</p>
    <input
      type="tel"
      placeholder="رقم الهاتف (اختياري)"
      className="mt-2 w-full rounded-md bg-slate-800 px-3 py-2 text-slate-100"
    />
  </div>
)}
```
**لماذا هو مخالف:** لا `value`/`onChange` (uncontrolled)، لا `name`، لا `id`، **غير مربوط بأي submit** — حقل ميّت يخدع المستخدم ويوهمه أن رقمه سيُحفظ. ← هذا هو ما طلبتَ إزالته.

**الحقل الشرعي — `components/chat/ChatInterface.tsx:446-453`:** `type="text"` مربوط بـ `draft`/`setDraft` مع `maxLength={MAX_MESSAGE_LENGTH}` و `aria-label="رسالة"` — **يجب الإبقاء عليه** (مُرسِل المحادثة الوحيد).

**تفصيل إضافي:** لا يوجد أي `name=` أو `id=` على أيٍّ من الحقلين ⇒ لا يوجد نموذج HTML يُرسل حقولاً على أي حال.

---

## السؤال 11 — أين يُعرَض "مفتوح/مغلق" حالياً؟

**المكوّن:** `components/public/HoursStatusBadge.tsx` (client component)
- `:17` — `export default function HoursStatusBadge({ slug }: { slug: string })`
- `:20-33` — `useEffect` يجلب `/api/public/clinic/hours-status?slug=…` (مع `alive` flag لمنع تسرّب الحالة)
- `:35` — `if (!status) return null;` (لا عرض قبل البيانات → لا hydration flash)
- `:39-48` — `مفتوح الآن` + نقطة `bg-emerald-500` نابضة + `start – end`
- `:49-58` — `مغلق الآن` + نقطة `bg-rose-500` + `يفتح {day} الساعة {time}`

**أماكن التركيب (موضعان فقط، كلاهما عام):**

| السطر | السياق | الشرط |
|---|---|---|
| `components/public/ActivitySpaceChrome.tsx:308` | داخل `StaggerReveal delay={230}` في الـ hero | `space.workingHours.length > 0` |
| `components/public/ActivitySpaceChrome.tsx:533` | أعلى قسم جدول الساعات مباشرةً | داخل `flex justify-center` |

**الـ API:** `app/api/public/clinic/hours-status/route.ts`
- `:16-17` — `dynamic = 'force-dynamic'`، `fetchCache = 'force-no-store'`
- `:24-28` — slug إلزامي → `resolvePublicClinic({ slug })` → 404 إن لم تُوجد
- `:30-34` — `.from('provider_schedules').select('weekday, start_time, end_time').eq('clinic_id', clinic.id).eq('enabled', true)`
- `:38-48` — دمج لكل يوم: أبكر `start_time` / آخر `end_time`
- `:50-56` — `isOpen` بمقارنة نصّية `HH:MM` بـ **توقيت السيرفر**
- `:59-71` — `nextOpening` (اليوم → غداً → أول يوم مجدول)

---

## السؤال 12 — هل المكوّنات مشتركة (global) أم مكرّرة لكل عيادة؟

**الجواب: مشتركة بالكامل — لا تكرار لكل عيادة.** ✅

| الطبقة | الملف | النمط |
|---|---|---|
| حل الـ tenant | `lib/services/clinics.ts:65` | دالة واحدة لكل العيادات |
| Badge | `components/public/HoursStatusBadge.tsx` | مكوّن واحد، يُمرَّر له `slug` |
| قشرة الصفحة العامة | `components/public/ActivitySpaceChrome.tsx` | مكوّن واحد لكل أنواع النشاط |
| API الحالة | `app/api/public/clinic/hours-status/route.ts` | مسار واحد `?slug=` |
| بيانات الصفحة العامة | `lib/services/activityPublicSpace.ts` + `lib/services/clinicPublicProfile.ts` | دالتان مُقيَّدتان بـ `clinic_id` |
| قراءة الـ AI | `lib/ai/clinicDataContext.ts` | دالة واحدة `clinicId` |
| محرك الحجز | `lib/services/bookingService.ts` + `lib/services/scheduling.ts` | عامان، `clinicId` param |
| محرك الـ AI | `lib/ai/orchestrator.ts` | عام، `clinicId` param |

**النتيجة الإيجابية:** أي إصلاح في هذه الملفات **عام تلقائياً** لـ Amal X-Ray Center ولجميع العيادات الحالية والمستقبلية — بلا أي تعديل لكل عيادة.

**الاستثناء الوحيد:** `GALLERY_CATEGORIES` مُعرَّف *محلياً* في `components/public/ActivitySpaceChrome.tsx:37-43` مع تعليق صريح بأن ذلك مقصود: "the service module imports node crypto + supabase admin and must never reach the client bundle".

---

## مشكلة إضافية — توليد الفترات من `provider_schedules`

**المسار الكامل:** `availabilityTool.findEarliestAvailableSlot` → `bookingService.getAvailableSlots` → `scheduling.suggestFreeSlots`

```ts
// lib/services/bookingService.ts:26-65 — loadProviderSchedule
.from('provider_schedules').select('*')
.eq('clinic_id', clinicId).eq('provider_id', providerId);          // :26-30  ✅ العزل
const days = (scheduleRows ?? []).map((row) => ({
  weekday: row.weekday,
  enabled: row.enabled,                                            // :49
  start: row.start_time,                                           // :50
  end: row.end_time,                                               // :51
  breaks: Array.isArray(row.breaks) ? row.breaks : [],             // :52 ← يُمرَّر ولا يُستخدم لاحقاً
}));                                                               // ❌ shifts غير مقروء إطلاقاً
const appointmentDurationMinutes = scheduleRows?.[0]?.appointment_duration_minutes ?? 30;  // :55
const maxAppointmentsPerDay = scheduleRows?.[0]?.max_appointments_per_day ?? null;          // :56
```
```ts
// lib/services/scheduling.ts:112-131 — suggestFreeSlots
const day = params.schedule.days.find((item) =>
  item.weekday === new Date(`${params.date}T00:00:00Z`).getUTCDay());   // :112
if (!day?.enabled) return [];                                           // :113
const interval = params.intervalMinutes ?? params.schedule.appointmentDurationMinutes;  // :114
for (let cursor = minutes(day.start);
     cursor + params.schedule.appointmentDurationMinutes <= minutes(day.end);
     cursor += interval) {                                              // :117
  ...
  if (result.available) slots.push(`${params.date}T${hours}:${mins}:00.000Z`);  // :128
  if (slots.length >= limit) break;                                     // :129
}
```

**أسباب "الفترة 9:00 فقط" (مرشَّحة، بحاجة تأكيد على صفوف القاعدة):**
1. **الحلقة تبدأ من `day.start` فقط وتتوقف عند `day.end`** — لا تعرف عن `shifts`. إن كان الدوام الحقيقي ورديتين (صباحية `09:00-13:00` + مسائية `15:00-20:00` مخزَّنتين في `shifts`)، فالمحرك يرى الوردية الأولى فقط.
2. **مسار حفظ الـ UI (`schedule/route.ts:73-84`) لا يكتب `shifts`** ⇒ الوردية المسائية تُحذف من الأصل عند الحفظ ⇒ المحرك والأيضاً الـ AI يريان الصباح فقط.
3. **`breaks` مُمرَّرة في `schedule.days` ولا تُقرأ في `checkSlotAvailability`** ⇒ فترات الاستراحة تُعرَض كمتاحة.
4. **`cursor + apptDuration <= minutes(day.end)`** — إذا كان `end_time` مساوياً للوردية الأولى فقط (مثلاً `09:30` أو `13:00` مع duration كبير) → فترة واحدة بالضبط، وهو تطابق تام مع العَرَض.
5. **العَرَض نفسه لا يمكن تأكيده من الكود وحده** — يحتاج استعلاماً على صفوف `provider_schedules` للعيادة المعنية للتمييز بين (1) و(2) و(4).

**ملاحظة:** `getAvailableSlots` يستقبل `limit` من `availabilityTool.ts:122` (`limitPerDay = 5`) — فليس هناك سقف عند حد واحد.

---

## ملحق — حالة Phase 2 (المعرض) كما هي في الكود الآن

| العنصر | الملف | الحالة |
|---|---|---|
| تصنيفات المعرض (client) | `components/public/ActivitySpaceChrome.tsx:37-43` | ✅ 5 تصنيفات: `clinic`, `team`, `equipment`, `cases`, `other` |
| قراءة الوسائط للصفحة العامة | `lib/services/activityPublicSpace.ts:206-222` | ✅ `.from('clinic_public_media').select('id, media_type, public_url, title, caption, alt_text, category').eq('clinic_id', clinic.id).eq('enabled', true).order('display_order').limit(24)` |
| خدمة الإدارة | `lib/services/clinicPublicMedia.ts` | ✅ موجودة |
| لوحة الإدارة | `components/dashboard/clinic/PublicMediaManager.tsx` | ✅ موجودة |
| الجداول | `db/migrations/20260921_clinic_public_media.sql`، `20260922_clinic_public_media_category.sql`، `20260923_clinic_before_after.sql` | ✅ مُطبَّقة |
| مسار API إداري للمعرض | `app/api/clinic/` | ⚠️ لا يوجد مجلد `gallery`/`media` — الإدارة تمرّ عبر Server Actions أو مسار آخر يحتاج تأكيداً |

**مطلوب:** تحديد نطاق Phase 2 بدقة قبل البدء.

---

## خطة الإصلاح المقترحة (جميعها عامة / multi-tenant)

| # | الإصلاح | الملفات | النوع |
|---|---|---|---|
| F1 | إنشاء مصدر حقيقة واحد لساعات العمل: `lib/services/clinicHours.ts` — يستقبل `clinicId` + `timeZone`، يفلتر بـ `enabled`، يدمج `shifts` + `breaks`، ويُعيد بنية موحّدة | جديد + تعديل `clinicDataContext.ts`, `hours-status/route.ts`, `clinicPublicProfile.ts` | 🔴 حاسم |
| F2 | تمرير `timeZone` من `loadClinicProfile().timezone` إلى `loadClinicWorkingHours`، وحساب "مفتوح الآن" بـ `Intl.DateTimeFormat` (نمط `understanding.ts:61-90`) بدلاً من `getHours()/getDay()` | `clinicDataContext.ts:62-91`, `hours-status/route.ts:50-56` | 🔴 حاسم |
| F3 | إصلاح `is_active` → `enabled` (أو يُستهلك عبر F1) | `clinicDataContext.ts:68` | 🔴 حاسم |
| F4 | دعم `shifts` + `breaks` في محرك التوفر، وكتابتهما في مسار حفظ الـ UI | `bookingService.ts:47-56`, `schedule/route.ts:73-84`, `scheduling.ts:117-130` | 🟠 عالي |
| F5 | إزالة حقل `tel` الميّت من `ChatInterface.tsx:430-437` | `ChatInterface.tsx` | 🟡 متوسط |
| F6 | دمج صفوف عدة أطباء لكل weekday في مسار الـ AI (نمط أبكر/آخر) | `clinicDataContext.ts` أو F1 | 🟠 عالي |
| F7 | `maxDuration` + `BACKOFF_MS` | — | ✅ مُنفَّذ، لا عمل |

**مبدأ التصميم للجميع:** الاستدلال على `clinic_id` من `resolvePublicClinic` فقط، وقراءة `timezone` من `clinics.settings.timezone` مع fallback إلى `clinic_settings.timezone` ثم `'UTC'` — بلا أي قيمة مبرمجة لكل عيادة.

---

*نهاية التقرير — Phase 1 مكتمل. لا تعديلات كود في هذه المرحلة.*