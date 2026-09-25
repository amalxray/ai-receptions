#!/usr/bin/env python3
"""
تصنيف صور Gemini — يكتشف النموذج المناسب تلقائياً
"""
import os
import sys
import json
import time
from pathlib import Path
from google import genai
from PIL import Image

API_KEY = os.environ.get("GEMINI_API_KEY", "")
PICS_DIR = Path("/tmp/pics/ai-reciptions-pic")
OUTPUT_DIR = Path("/tmp/pics/renamed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# قائمة أولويات — سنختبر أول نموذج يعمل
PREFERRED_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
]

PROMPT = """Analyze this image and respond ONLY with valid JSON:
{"description": "short English description (3-6 words)", "category": "one of: hero | gallery | about | before-after | icon | doctor | dental | other", "quality": "high | medium | low"}
No markdown, no explanation - JSON only."""


def discover_model(client):
    """يكتشف نموذجاً يعمل"""
    print("🔍 اكتشاف النماذج المتاحة...")
    available = []
    try:
        for m in client.models.list():
            name = m.name.replace("models/", "")
            available.append(name)
    except Exception as e:
        print(f"   ✗ فشل: {e}")
        return None

    # ابحث عن نموذج من قائمتنا المفضلة
    for preferred in PREFERRED_MODELS:
        if preferred in available:
            print(f"   ✅ اخترنا: {preferred}\n")
            return preferred

    # إن لم يوجد، ابحث عن أي flash
    for name in available:
        if "flash" in name.lower() and "image" not in name.lower() and "tts" not in name.lower():
            print(f"   ⚠ لم نجد المفضّل، نستخدم: {name}\n")
            return name

    print(f"   ❌ لا نموذج مناسب\n")
    return None


def classify_image(client, model_name, img_path):
    try:
        img = Image.open(img_path)
        img.thumbnail((512, 512))
        response = client.models.generate_content(
            model=model_name,
            contents=[PROMPT, img]
        )
        text = response.text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception as e:
        return {"error": str(e)[:200], "description": "?", "category": "other", "quality": "?"}


def main():
    if not API_KEY:
        print("❌ ضع مفتاح Gemini في GEMINI_API_KEY")
        sys.exit(1)

    client = genai.Client(api_key=API_KEY)

    model_name = discover_model(client)
    if not model_name:
        print("❌ لا نموذج متاح")
        sys.exit(1)

    files = sorted([f for f in PICS_DIR.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.jfif')])

    print(f"📷 وجدت {len(files)} صورة")
    print(f"🤖 النموذج: {model_name}\n")

    counter = {}
    results = []
    failed = 0

    for i, file in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {file.name}")
        data = classify_image(client, model_name, file)
        if "error" in data:
            print(f"   ✗ فشل: {data['error'][:100]}\n")
            failed += 1
            continue
        cat = data.get("category", "other")
        counter[cat] = counter.get(cat, 0) + 1
        new_name = f"{cat}-{counter[cat]:02d}.jpg"
        new_path = OUTPUT_DIR / new_name
        img = Image.open(file).convert("RGB")
        img.save(new_path, "JPEG", quality=85, optimize=True)
        print(f"   → {new_name}")
        print(f"     {data.get('description')}")
        print(f"     الفئة: {cat} | الجودة: {data.get('quality')}\n")
        results.append({
            "original": file.name,
            "new": new_name,
            "description": data.get("description"),
            "category": cat,
            "quality": data.get("quality"),
        })
        time.sleep(2)

    report_path = OUTPUT_DIR / "_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("=" * 50)
    print(f"✅ تم! {len(results)} صورة مصنّفة | {failed} فشلت")
    print(f"📁 في: {OUTPUT_DIR}")
    print(f"📊 التوزيع: {counter}")
    print(f"📄 التقرير: {report_path}")


if __name__ == "__main__":
    main()
