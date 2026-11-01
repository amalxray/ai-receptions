# خدمة تحليل صور الأسنان

خدمة FastAPI لتشغيل نموذج ONNX ذي 52 فئة. لا تستقبل هوية المريض أو العيادة، ولا تحفظ الصور أو تسجل محتواها. يتطلب endpoint مفتاح خدمة. يعمل النموذج من ملف ONNX محلي داخل مجلد `models/`.

## النشر على Render

اربط المستودع بـ Render وأنشئ خدمة Blueprint من `render.yaml`. يبني Docker النموذج من `models/best_model_upgraded.onnx` ويضبط `MODEL_PATH` تلقائياً. أدخل `INFERENCE_API_KEY` كـ Secret عند إنشاء الخدمة؛ يجب أن يكون المفتاح 32 حرفاً على الأقل، ولا تحفظه في Git. يستمع التطبيق إلى المنفذ الذي يمرره Render، مع `8000` كقيمة افتراضية محلية، ويتحقق Render من الجاهزية عبر `/health`.

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

انسخ ملف `best_model_upgraded.onnx` الناتج إلى `ai-inference/models/best_model_upgraded.onnx`. لا تضع أوزان النموذج في Git. تتحقق الخدمة عند بدء التشغيل من مدخل 1024 ومن 52 فئة في مخرجات ONNX. تحقق من أسماء الفئات ومقاييس النموذج على مجموعة تحقق قبل أي استخدام سريري.

## النشر على Oracle Cloud Free Tier (Ubuntu ARM)

يعتمد هذا الدليل على VM بمعمارية ARM وصورة Ubuntu. ملف `docker-compose.yml` الحالي يعرّض الخدمة داخلياً على `8000`، ويشغّل Caddy على `80/443`؛ لا ينشر منفذ الخدمة مباشرة إلى المضيف. لاستخدام ملف ONNX محلي بدلاً من تحميل خارجي، جهّز نموذجاً على الخادم وأضف ملف Compose override كما هو موضح أدناه.

### 1. إنشاء VM والحصول على عنوانها العام

1. في Oracle Cloud Console، أنشئ Instance واختر صورة **Ubuntu Server ARM64** وشكلاً متوافقاً مع Free Tier.
2. في تفاصيل الـInstance افتح **Primary VNIC → IPv4 Addresses** وسجّل **Public IPv4 address**. استخدم Reserved Public IP إذا كنت تحتاج عنواناً ثابتاً بعد إعادة إنشاء الـInstance.
3. اتصل بالخادم عبر SSH باستخدام عنوانه العام ومفتاح SSH الذي أعددته عند إنشاء الـInstance:

```bash
ssh -i /path/to/private-key.pem ubuntu@<PUBLIC_IP>
```

### 2. تثبيت Docker Engine وCompose

نفّذ الأوامر التالية على Ubuntu ARM64 لإضافة مستودع Docker الرسمي وتثبيت Docker Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world
docker compose version
```

### 3. تجهيز التطبيق والنموذج

استنسخ المستودع على الخادم، ثم انسخ **ملف ONNX فقط** إلى مجلد الخدمة عبر SCP. لا تنسخ مجلد التدريب أو صور البيانات إلى الخادم:

```bash
git clone <REPOSITORY_URL> ai-receptions
cd ai-receptions/ai-inference
mkdir -p models
```

من جهازك المحلي، وفي نافذة طرفية أخرى:

```bash
scp -i /path/to/private-key.pem \
  ./ai-inference/models/best_model_upgraded.onnx \
  ubuntu@<PUBLIC_IP>:~/ai-receptions/ai-inference/models/
```

تحقق من تطابق SHA-256 على الجهازين قبل التشغيل:

```bash
sha256sum models/best_model_upgraded.onnx
```

أنشئ `.env` على الخادم دون حفظ المفتاح في Git:

```bash
printf 'INFERENCE_API_KEY=%s\nAI_DOMAIN=<PUBLIC_IP>\n' "$(openssl rand -hex 32)" > .env
chmod 600 .env
```

قبل تنفيذ الأمر، استبدل `<PUBLIC_IP>` بعنوان الـVM العام الفعلي. يتطلب Compose الحالي `AI_DOMAIN` حتى عند تشغيل خدمة الاستدلال وحدها؛ عند استخدام Caddy وTLS استخدم بدلاً منه اسم DNS موجهاً إلى عنوان الخادم.

أنشئ على الخادم ملف `docker-compose.oracle.yml` لإتاحة النموذج المحلي ونشر منفذ الاختبار:

```yaml
services:
  inference:
    volumes:
      - ./models:/models:ro
    ports:
      - "8000:8000"
```

### 4. فتح TCP 8000 وتشغيل الخدمة

في Oracle Cloud Console، أضف **Ingress Rule** إلى Network Security Group المرتبط بالـVNIC (أو Security List للشبكة الفرعية):

- Source CIDR: عنوان IP الخاص بك متبوعاً بـ`/32` للاختبار، وليس `0.0.0.0/0` إن أمكن.
- IP Protocol: TCP
- Destination Port Range: `8000`

إذا كان UFW مفعّلاً على Ubuntu، اسمح فقط بعنوان IP الموثوق:

```bash
sudo ufw allow from <YOUR_PUBLIC_IP>/32 to any port 8000 proto tcp
sudo ufw status
```

شغّل الخدمة فقط من دون Caddy:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.oracle.yml \
  up -d --build inference
sudo docker compose -f docker-compose.yml -f docker-compose.oracle.yml logs -f inference
```

تحقق من جاهزية النموذج:

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail "http://<PUBLIC_IP>:8000/health"
```

للإيقاف:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.oracle.yml \
  down
```

**تنبيه أمني:** الاتصال المباشر على `http://<PUBLIC_IP>:8000` غير مشفّر. لا ترسل عبره صور مرضى أو بيانات حساسة. للاستخدام الحقيقي، لا تفتح 8000 للعامة؛ استخدم Caddy المضمّن مع DNS صحيح وTLS، وافتح 80/443 فقط، ثم اختبر عبر `https://<AI_DOMAIN>/health`. تقييد مصدر الشبكة ومفتاح API لا يعوضان التشفير.

`healthcheck.sh` يتحقق من الاستجابة فقط ولا يولّد حملاً اصطناعياً. راقب الذاكرة ومساحة القرص وقيود Oracle Always Free؛ توافر الموارد المجانية ليس ضماناً للاستمرارية.

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
