"""
اختبار نموذج كشف الأسنان على Roboflow (yolov8n-dental-v1)

- يستخدم مكتبة requests فقط (متوافق مع Python 3.14، بدون inference-sdk)
- يعمل من الـ Terminal فلا توجد مشكلة CORS
- يرسل الصورة كـ Base64

الاستخدام (PowerShell):
    $env:ROBOFLOW_API_KEY = "your_key"
    python test_roboflow.py path\\to\\xray.jpg

يمكن أيضاً وضع ROBOFLOW_API_KEY في ملف .env.local أو .env بجذر المشروع.
"""

import base64
import json
import os
import sys
from pathlib import Path

import requests

MODEL_URL = os.getenv(
    "ROBOFLOW_MODEL_URL",
    "https://detect.roboflow.com/shadi-ai/yolov8n-dental-v1/1",
)
DEFAULT_IMAGE = "test_xray.jpg"
OUTPUT_FILE = "detection_result.json"
CONFIDENCE = 40  # نسبة مئوية (0-100)
OVERLAP = 30  # نسبة مئوية (0-100)


def load_env_files() -> None:
    """قراءة .env.local ثم .env (بدون مكتبات خارجية) دون تجاوز المتغيرات الموجودة."""
    root = Path(__file__).resolve().parent
    for name in (".env.local", ".env"):
        path = root / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def detect(image_path: Path, api_key: str) -> dict:
    img_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")

    print(f"📤 إرسال الصورة: {image_path}")
    print(f"🌐 URL: {MODEL_URL}")

    response = requests.post(
        MODEL_URL,
        params={"api_key": api_key, "confidence": CONFIDENCE, "overlap": OVERLAP},
        data=img_b64,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )

    if response.status_code != 200:
        print(f"❌ خطأ HTTP {response.status_code}")
        print(f"📄 التفاصيل: {response.text}")
        sys.exit(1)

    return response.json()


def print_results(result: dict) -> None:
    predictions = result.get("predictions", [])

    print("\n" + "=" * 60)
    print(f"✅ عدد الاكتشافات: {len(predictions)}")
    print("=" * 60)

    if not predictions:
        print("⚠️  لم يتم اكتشاف أي شيء في الصورة")
        return

    summary: dict = {}
    for i, pred in enumerate(predictions, 1):
        cls = pred.get("class", "unknown")
        summary[cls] = summary.get(cls, 0) + 1
        print(f"\n🔍 الكشف #{i}")
        print(f"   الفئة   : {cls}")
        print(f"   الثقة   : {pred.get('confidence', 0) * 100:.2f}%")
        print(f"   الموقع  : x={pred.get('x')}, y={pred.get('y')}")
        print(f"   الأبعاد : w={pred.get('width')}, h={pred.get('height')}")

    print("\n" + "=" * 60)
    print("📊 ملخص الفئات:")
    for cls, count in summary.items():
        print(f"   • {cls}: {count}")
    print("=" * 60)


def main() -> int:
    load_env_files()

    api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        print("⚠️  لم يتم تعيين ROBOFLOW_API_KEY:")
        print("   PowerShell : $env:ROBOFLOW_API_KEY = 'your_key'")
        print("   أو ضعه في ملف .env.local بجذر المشروع")
        return 1

    image_path = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IMAGE)
    if not image_path.is_file():
        print(f"❌ الصورة غير موجودة: {image_path}")
        print("   الاستخدام: python test_roboflow.py path\\to\\xray.jpg")
        return 1

    try:
        result = detect(image_path, api_key)
    except requests.exceptions.RequestException as exc:
        print(f"❌ خطأ في الاتصال: {exc}")
        return 1

    print_results(result)

    Path(OUTPUT_FILE).write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n💾 تم حفظ النتائج في: {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
