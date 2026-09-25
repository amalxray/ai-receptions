# نموذج البيانات — أين تُخزَّن الحالة؟

## جدول `clinics` (23 عمودًا، مثبتة بقراءة حية)

`activity_type, address, address_detail, area, city, country, created_at,`
`deleted_at, email, founding_price_locked_at, google_maps_url, id,`
`is_founding_member, latitude, logo, longitude, name, phone, public_id,`
`settings, slug, updated_at, website`

لا يوجد عمود `discovery_enabled` ولا `subdomain` — وهذا مقصود (انظر القاعدة أدناه).

## قاعدة no-DDL

لا تُضاف أعمدة جديدة لجدول `clinics` (رمز الهجرة منتهي).
كل حالة جديدة = **مفتاح JSONB داخل `settings`**، والكتابة دمج لا استبدال.

## مفتاحا `settings`

| المسار | المحتوى |
|---|---|
| `settings.tenant` | `subdomain, subdomain_status ('active'\|'failed'), subdomain_error?, provisioned_at?` — سجل التجهيز (للعرض فقط، ليس قرار التحويل) |
| `settings.public_profile` | `description, tagline, about, show_phone, show_prices, display, theme, discovery_enabled` — إعدادات الصفحة العامة |

⚠️ **`discovery_enabled` مفتاح JSONB داخل `public_profile`، وليس عمودًا** — هذا سبب سوء فهم سابق، وثّقناه هنا لمنع تكراره.

## الإحداثيات والاكتشاف

- `latitude/longitude` عمودان عاديان (nullable).
- `/ask` يستبعد الصفوف بلا إحداثيات (`.not('latitude','is',null)`) — يؤثر على البطاقات فقط.
- آخر قراءة حية: 3 عيادات بلا إحداثيات (التفاصيل المتنازع عليها في `07-backlog.md` بند B10).
