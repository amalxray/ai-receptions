#!/usr/bin/env python3
"""اختبار صورة واحدة + طباعة الخطأ الكامل"""
import os
from pathlib import Path
from google import genai
from PIL import Image

API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not API_KEY:
    print("❌ GEMINI_API_KEY فارغ")
    exit(1)

print(f"🔑 المفتاح: {API_KEY[:15]}...")
print(f"📏 الطول: {len(API_KEY)}\n")

client = genai.Client(api_key=API_KEY)

# اطبع النماذج المتاحة
print("📋 النماذج المتاحة:")
try:
    for m in client.models.list():
        print(f"   - {m.name}")
except Exception as e:
    print(f"   ✗ فشل: {e}")
    exit(1)

# اختبر صورة واحدة
img_path = Path("/tmp/pics/ai-reciptions-pic")
files = sorted([f for f in img_path.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.jfif')])

if not files:
    print("❌ لا صور في /tmp/pics/ai-reciptions-pic/")
    exit(1)

test_file = files[0]
print(f"\n🧪 اختبار: {test_file.name}")

try:
    img = Image.open(test_file)
    img.thumbnail((512, 512))
    print(f"   الصورة محملة: {img.size}")

    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",
        contents=["What's in this image? Answer in 5 words.", img]
    )
    print(f"\n✅ نجح!")
    print(f"   الرد: {response.text}")
except Exception as e:
    print(f"\n❌ فشل:")
    print(f"   النوع: {type(e).__name__}")
    print(f"   الرسالة: {e}")
    import traceback
    print(f"\n📋 تتبع كامل:")
    traceback.print_exc()
