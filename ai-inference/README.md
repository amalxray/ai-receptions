---
title: Dental Image Inference
emoji: 🦷
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# خدمة تحليل صور الأسنان

خدمة FastAPI لتشغيل نموذج ONNX ذي 52 فئة. لا تستقبل هوية المريض أو العيادة، ولا تحفظ الصور أو تسجل محتواها. يستخدم endpoint مفتاح خدمة عبر HTTPS، ويحمل ملف ONNX وقت بدء التشغيل من Hugging Face Model Repo.

للنشر كـ Hugging Face Docker Space، ارفع محتويات هذا المجلد إلى جذر المستودع. اضبط `HF_MODEL_REPO_ID` كمتغير بيئة في Space، و`INFERENCE_API_KEY` كـ Secret بقيمة عشوائية لا تقل عن 32 حرفاً. للمستودع الخاص، أضف `HF_TOKEN` كـ Secret بصلاحية القراءة. اسم الملف الافتراضي في مستودع النموذج هو `best_model_upgraded.onnx` ويمكن تغييره عبر `HF_MODEL_FILENAME`.

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

النموذج المعتمد هو `best_model_upgraded.pt` ذو 52 فئة. لتصديره محلياً من جذر المشروع، استخدم Ultralytics في بيئة التدريب:

```python
from ultralytics import YOLO

model = YOLO("dental_ai_training/dental_ai_training/best_model_upgraded.pt")
model.export(format="onnx", imgsz=1024, opset=12)
```

ارفع الناتج `best_model_upgraded.onnx` إلى Hugging Face Model Repo منفصل؛ لا تضع الأوزان في مستودع التطبيق. تُحمّل الخدمة الملف عند بدء التشغيل وتتحقق من مدخل 1024 ومن 52 فئة في مخرجات ONNX. تحقق من أسماء الفئات ومقاييس النموذج على مجموعة تحقق قبل أي استخدام سريري.

## إعداد Docker Compose

1. ثبّت Docker Engine وCompose v2. عند النشر خلف Caddy، وجّه `AI_DOMAIN` إلى عنوان الخادم وافتح TCP 80/443؛ لا تفتح 8000 للإنترنت.
2. انسخ `.env.example` إلى `.env`. اضبط `AI_DOMAIN`، ومفتاح `INFERENCE_API_KEY` عشوائياً بطول 32 حرفاً أو أكثر، و`HF_MODEL_REPO_ID`. للمستودع الخاص أضف `HF_TOKEN` بصلاحية القراءة.
3. شغّل `chmod +x deploy.sh healthcheck.sh` ثم `./deploy.sh`. تُنزّل الخدمة ONNX من Hugging Face عند بدء التشغيل؛ يتطلب ذلك اتصالاً خارجياً إلى Hub. Caddy يطلب شهادة TLS بعد تحقق DNS ووصول المنافذ.
4. تحقّق يدوياً من `https://<AI_DOMAIN>/health` ثم اختبر `/analyze` بصورة اختبار غير طبية. لا يبدأ ربط بيانات المرضى قبل اجتياز مقارنة الدقة واختبار العزل.

`healthcheck.sh` يتحقق من الاستجابة فقط ولا يولّد حملاً اصطناعياً. حدّد متطلبات التوافر وراقب استخدام CPU/RAM والقرص والشبكة.

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
