# كتيّبات التشغيل — الأوامر والتحقق

## تجهيز النطاقات (P0)

```bash
npm run provision:tenants -- --persist <slug…>   # idempotent، آمن الإعادة
npm run verify:tenants                            # تحقق قراءة خالصة (host + QR + canonical)
```

- `--persist` يكتب `settings.tenant` ويحذف أي خطأ قديم عند النجاح.
- التراجع: `removeClinicSubdomain(slug)` (لا فقدان بيانات).

## الفحص والبناء

```bash
npx vitest run tests/unit/<file>.test.ts          # ملف واحد
npx tsc --noEmit                                   # فحص الأنواع
npm run build                                      # EXIT 0 = جاهز
npm run probe:gate / probe:fi / probe:matrix      # مسابر @/* عبر vite-node
```

## التحقق الحي (قراءة فقط، 9 نقاط)

```bash
curl -I https://www.dentairec.com/hala-clinic        # 301 → الفرعي
curl -I https://www.dentairec.com/book               # 200 (بلا تحويل)
curl -I https://www.dentairec.com/ask                # 200 (بلا تحويل)
curl -I https://www.dentairec.com/random-xyz-999     # 404 (بلا تحويل)
curl -I https://hala-clinic.dentairec.com/           # 200
curl -s https://www.dentairec.com/sitemap.xml | grep hala-clinic
curl -s https://hala-clinic.dentairec.com/ | grep -i canonical
curl -s https://www.dentairec.com/ask | grep -oE 'https://[a-z-]+\.dentairec\.com'
```

## Vercel API (قراءة)

```bash
GET https://api.vercel.com/v9/projects/{projectId}/domains   # قائمة النطاقات
```

يحتاج `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` من `.env.local` — **لا تنسخهما لأي ملف**.
