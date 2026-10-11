# خدمة تحليل صور الأسنان

خدمة FastAPI مستقلة لتشغيل نموذج ONNX على Oracle Ampere A1. لا تستقبل هوية المريض أو العيادة، ولا تحفظ الصور أو تسجل محتواها. يستخدم endpoint مفتاح خدمة عبر HTTPS، ويدعم نموذج YOLOv8l ذي 31 فئة المكتشفة في `best.pt`.

## تشغيل واختبار محلي على Windows

من PowerShell في مجلد المشروع:

```powershell
Set-Location .\ai-inference
py -3.11 -m venv .venv-win311
.\.venv-win311\Scripts\python.exe -m pip install -r .\requirements.txt
$env:MODEL_PATH = "$PWD\models\best_model_upgraded.onnx"
$line = Get-Content .\.env | Where-Object { $_ -match '^INFERENCE_API_KEY=' } | Select-Object -First 1
$env:INFERENCE_API_KEY = ($line -replace '^INFERENCE_API_KEY=', '').Trim('"').Trim("'")
if ($env:INFERENCE_API_KEY.Length -lt 32) { throw "INFERENCE_API_KEY is missing or too short." }
$env:ENABLE_API_DOCS = "true"
.\.venv-win311\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

إذا احتجت للوصول من جهاز آخر على الشبكة المحلية، استخدم `--host 0.0.0.0` بدلاً من `127.0.0.1` وافتح المنفذ محلياً فقط عند الضرورة. لا توجه المنفذ مباشرة إلى الإنترنت.

في نافذة PowerShell ثانية، تحقق من الجاهزية والتوثيق ثم أرسل صورة اختبار من مجموعة محلية منزوعة metadata:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
(Invoke-WebRequest http://127.0.0.1:8000/docs).StatusCode
$image = "C:\path\to\scrubbed-test-panorama.png"
$line = Get-Content .\.env | Where-Object { $_ -match '^INFERENCE_API_KEY=' } | Select-Object -First 1
$env:INFERENCE_API_KEY = ($line -replace '^INFERENCE_API_KEY=', '').Trim('"').Trim("'")
curl.exe --fail-with-body -H "X-API-Key: $env:INFERENCE_API_KEY" -F "image=@$image" http://127.0.0.1:8000/analyze
```

`ENABLE_API_DOCS` يعرض `/docs` و`/redoc` و`/openapi.json` عند تفعيله فقط؛ اتركه `false` عند النشر العام. يُقرأ المفتاح من `.env` محلياً، فلا تطبعه أو تحفظه في كود الواجهة أو المستودع. أغلق الخادم بـ`Ctrl+C`.

## Cloudflare Tunnel على Windows

ثبّت أداة Cloudflare الرسمية مرة واحدة ثم شغّلها في نافذة منفصلة بعد إيقاف خادم التطوير وإعادة تشغيله مع `ENABLE_API_DOCS=false`:

```powershell
winget install --id Cloudflare.cloudflared --exact
cloudflared tunnel --url http://localhost:8000
```

انسخ عنوان `https://<random-words>.trycloudflare.com` الذي يظهر في الطرفية؛ هذا هو `AI_INFERENCE_URL` ولا تضف إليه `/analyze`. أوقف النفق بـ`Ctrl+C`. Quick Tunnel مجاني لكنه مؤقت، عنوانه يتغير عند إعادة التشغيل ولا يضمن وقت تشغيل؛ الجهاز والإنترنت يجب أن يظلا متصلين. لاختبار مستقر استخدم Named Tunnel مرتبطاً بحساب ودومين، وشغّله كخدمة Windows.

في Vercel: **Project → Settings → Environment Variables**، أضف `AI_INFERENCE_URL` بعنوان HTTPS للنفق و`AI_INFERENCE_API_KEY` بالقيمة المطابقة لـ`INFERENCE_API_KEY` (Secret)، واحصرهما مبدئياً ببيئة Preview. أعد نشر Preview بعد الحفظ. لا تستخدم Quick Tunnel لبيانات مرضى أو تشغيل إنتاجي؛ كل طلب يمر عبر الإنترنت إلى جهازك.

## CORS والاتصال من dentairec

لا يلزم CORS عندما يستدعي `app/api/ai/panorama-analyze` خدمة الاستدلال من الخادم؛ CORS قيد متصفح ولا يحمي API key. لا تستدعِ `/analyze` مباشرة من React ولا تضع `INFERENCE_API_KEY` في متغيرات `NEXT_PUBLIC_*`. عند تشغيل Next.js محلياً، اضبط `AI_INFERENCE_URL=http://127.0.0.1:8000` و`AI_INFERENCE_API_KEY` في بيئة الخادم المحلية فقط. خادم Vercel لا يستطيع الوصول إلى localhost على جهاز المطور.

للاختبار من Vercel استخدم نفق HTTPS مؤقتاً (مثلاً Cloudflare Quick Tunnel أو ngrok) إلى خدمة localhost، ثم عيّن `AI_INFERENCE_URL` في بيئة Vercel إلى عنوان النفق، و`AI_INFERENCE_API_KEY` إلى المفتاح المطابق. أعد نشر Vercel بعد تعديل المتغيرات. النفق يجعل الخدمة متاحة عبر الإنترنت؛ استخدم مفتاحاً قوياً، ولا ترسل صوراً أو بيانات مرضى عبر نفق تجريبي. استخدم فقط صورة اختبار مصرحاً بها ومنزوعة البيانات التعريفية، وأوقف النفق والخدمة بعد الاختبار. هذا إعداد اختبار مؤقت وليس بديلاً عن نشر مستقر.

## النموذج والتحويل

حجم `best.pt` الذي فُحص هو 349,996,979 بايت. تشير بياناته الوصفية إلى نموذج مبني على `yolov8l.pt`، و31 فئة، وحجم إدخال تدريب 1024، إضافة إلى حالة optimizer من AdamW. استُخرجت البيانات الوصفية من أرشيف checkpoint دون unpickle. يحذف تصدير ONNX حالة التدريب؛ التقدير النظري لملف FP32 قرابة 175 MB، ويجب قياس الملف الناتج.

في Colab أو بيئة تدريب موثوقة، ثبّت إصدار Ultralytics المستخدم عند التدريب، وصِل Drive، ثم:

```python
from ultralytics import YOLO

model = YOLO("/content/drive/MyDrive/dental_ai_training/runs/dental_v1237528182_final/weights/best.pt")
onnx_path = model.export(
    format="onnx",
    imgsz=1024,
    batch=1,
    half=False,
    dynamic=False,
    simplify=False,
    opset=17,
    nms=False,
)
print(onnx_path)
```

لا تُفعّل FP16 أو INT8 قبل مقارنة مخرجات PyTorch وONNX. قارن على نفس مجموعة تحقق ثابتة: mAP50، mAP50-95، precision، recall لكل فئة، وتطابق الصناديق/الثقة. احتفظ بـ`.pt` خارج Git ولا تنقل صور مرضى إلى Colab دون أساس موافقة مناسب. انسخ النموذج المقبول إلى `models/best_model_upgraded.onnx`.

## إعداد Oracle

1. أنشئ VM.Standard.A1.Flex في منطقة الحساب ضمن حد Always Free، مع Linux ARM64، وخصص 2 OCPU و12 GB فقط. افتح TCP 22 للإدارة الموثوقة، و80/443 لـCaddy؛ لا تفتح 8000 للإنترنت.
2. ثبّت Docker Engine وCompose v2. وجّه سجل DNS الخاص بـ`AI_DOMAIN` إلى عنوان عام ثابت للـVM، ثم انسخ مجلد `ai-inference` إليها.
3. أنشئ `models/` وانقل ONNX عبر قناة إدارية مشفرة. تحقّق من SHA-256 عبر القناة نفسها.
4. انسخ `.env.example` إلى `.env`، ولّد مفتاحاً عشوائياً قوياً، واضبط `INFERENCE_API_KEY` و`AI_DOMAIN`. احفظ المفتاح المطابق في Vercel كـ`AI_INFERENCE_API_KEY`، واضبط `AI_INFERENCE_URL` على عنوان HTTPS الأساسي.
5. شغّل `chmod +x deploy.sh healthcheck.sh` ثم `./deploy.sh`. Caddy يطلب شهادة TLS تلقائياً بعد تحقق DNS ووصول المنافذ.
6. تحقّق يدوياً من `https://<AI_DOMAIN>/health` ثم اختبر `/analyze` بصورة اختبار غير طبية. لا يبدأ ربط بيانات المرضى قبل اجتياز مقارنة الدقة واختبار العزل.

`healthcheck.sh` يتحقق من الاستجابة فقط؛ لا يمنع Oracle من استرداد مثيل خامل ولا يولّد حملاً اصطناعياً. الحصة المجانية ليست ضمان توافر 24/7. حدد نسخاً احتياطية لإعدادات الخادم والموديل، وراقب استخدام CPU/RAM والقرص والشبكة.

## عقد الخدمة

- `GET /health` يعيد حالة الجاهزية وإصدار النموذج فقط.
- `POST /analyze` يستقبل `multipart/form-data` بحقل `image` و`X-API-Key`.
- الصيغ المقبولة صور يفكها Pillow؛ الحد الافتراضي 20 MiB، والحد الأقصى للأبعاد 40 مليون بكسل.
- النجاح: `{model_version, image_width, image_height, predictions}`. كل تنبؤ يتضمن `class_id`, `class_name`, `confidence`, و`box` بإحداثيات الصورة الأصلية.
- حد الخدمة الافتراضي 60 طلباً/دقيقة لكل نسخة، وبالتوازي طلب واحد لحماية CPU. هذا limiter داخل الذاكرة وليس موزعاً؛ يلزم limiter مركزي إذا تعددت نسخ الخدمة.
- محدد الطلبات في Next.js أيضاً محلي لكل نسخة Vercel؛ أضف حداً مركزياً عند زيادة عدد النسخ أو فتح الخدمة على نطاق أوسع.

## ربط Next.js والموافقة

`POST /api/ai/panorama-analyze` يستقبل `clinic_id`, `patient_id`, `medical_file_id`، و`consent=true` في FormData. يجب إظهار نص الموافقة قبل النداء؛ الخادم يتحقق من جلسة الموظف وعضويته ودوره، ومن ارتباط الملف والمريض بالعيادة، ثم يقرأ الملف الخاص من bucket `medical-files`. لا ترسل معرفات المرضى إلى Oracle؛ يرسل التطبيق الصورة فقط. تُحفظ النتائج وإصدار النموذج في `medical_image_analyses`، وليس الصورة.

نص مقترح للمراجعة القانونية: «أوافق على معالجة صورة الأشعة بواسطة نظام ذكاء اصطناعي مساعد لهذا الغرض. أفهم أن النتيجة ليست تشخيصاً ولا بديلاً عن تقييم طبيب مؤهل، وأن الصورة ستُنقل إلى خادم التحليل لمعالجتها». يلزم أن تعرض الواجهة النص قبل الطلب؛ `consent=true` وحده لا يثبت أن الموافقة عُرضت أو فُهمت. اعتمدوا نسخة النص بعد المراجعة القانونية المحلية.

الاحتفاظ: لا تخزن الخدمة نسخة الصورة؛ تبقى النسخة الأصلية وفق سياسة الملفات الطبية الحالية. صفوف `medical_image_analyses` لا تملك حالياً حذفاً تلقائياً؛ يجب تحديد مدة معتمدة وإضافة مهمة حذف/أرشفة قبل استخدام بيانات حقيقية. لا تسجل محتوى الصورة أو اسم الملف أو رموز المصادقة. يظل التزام Oracle وسياسات الحساب ومكان البيانات بحاجة لمراجعة قبل بيانات فعلية.
