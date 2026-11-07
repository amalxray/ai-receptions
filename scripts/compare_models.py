#!/usr/bin/env python3
"""Compare two Ultralytics-compatible models on the same randomly sampled images."""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from collections import Counter
from pathlib import Path
from typing import Any


IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
CSV_FIELDS = [
    "image",
    "old_model_detection_count",
    "old_model_classes",
    "old_model_class_counts",
    "old_model_average_confidence",
    "old_model_error",
    "new_model_detection_count",
    "new_model_classes",
    "new_model_class_counts",
    "new_model_average_confidence",
    "new_model_error",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run two Ultralytics-compatible models on the same random image sample "
            "and write per-image comparison results to CSV."
        )
    )
    parser.add_argument("--image-dir", required=True, type=Path, help="Directory containing images")
    parser.add_argument("--old-model", required=True, type=Path, help="Path to the old model (.pt or .onnx)")
    parser.add_argument("--new-model", required=True, type=Path, help="Path to the new model (.pt or .onnx)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("comparison_results.csv"),
        help="Output CSV path (default: comparison_results.csv)",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=100,
        help="Maximum number of images to sample (default: 100)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random sampling seed (default: 42)")
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.25,
        help="Minimum detection confidence for both models (default: 0.25)",
    )
    args = parser.parse_args()

    if args.sample_size < 1:
        parser.error("--sample-size must be at least 1")
    if not 0 <= args.confidence <= 1:
        parser.error("--confidence must be between 0 and 1")
    return args


def get_class_name(names: Any, class_id: int) -> str:
    if isinstance(names, dict):
        name = names.get(class_id, names.get(str(class_id)))
    elif isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
        name = names[class_id]
    else:
        name = None
    return str(name) if name is not None else f"class_{class_id}"


def model_detections(model: Any, image_path: Path, confidence: float) -> list[dict[str, Any]]:
    results = model.predict(source=str(image_path), conf=confidence, verbose=False)
    if not results:
        raise RuntimeError("Model returned no result for the image.")

    result = results[0]
    boxes = result.boxes
    if boxes is None:
        return []

    class_ids = boxes.cls.detach().cpu().tolist()
    confidences = boxes.conf.detach().cpu().tolist()
    if len(class_ids) != len(confidences):
        raise RuntimeError("Model returned different numbers of classes and confidence values.")

    names = getattr(result, "names", getattr(model, "names", None))
    return [
        {"class_name": get_class_name(names, int(class_id)), "confidence": float(score)}
        for class_id, score in zip(class_ids, confidences)
    ]


def summarize(detections: list[dict[str, Any]]) -> dict[str, Any]:
    class_counts = Counter(detection["class_name"] for detection in detections)
    classes = sorted(class_counts, key=str.casefold)
    average_confidence = (
        sum(detection["confidence"] for detection in detections) / len(detections)
        if detections
        else 0.0
    )
    return {
        "detection_count": len(detections),
        "classes": json.dumps(classes, ensure_ascii=False),
        "class_counts": json.dumps(dict(sorted(class_counts.items())), ensure_ascii=False),
        "average_confidence": f"{average_confidence:.6f}",
    }


def main() -> int:
    args = parse_args()
    image_dir = args.image_dir.expanduser()
    old_model_path = args.old_model.expanduser()
    new_model_path = args.new_model.expanduser()

    if not image_dir.is_dir():
        print(f"Image directory does not exist: {image_dir}", file=sys.stderr)
        return 2
    for model_path in (old_model_path, new_model_path):
        if not model_path.is_file():
            print(f"Model file does not exist: {model_path}", file=sys.stderr)
            return 2

    images = sorted(
        path
        for path in image_dir.rglob("*")
        if path.is_file() and path.suffix.casefold() in IMAGE_EXTENSIONS
    )
    if not images:
        print(f"No supported images found in: {image_dir}", file=sys.stderr)
        return 2

    if len(images) > args.sample_size:
        images = random.Random(args.seed).sample(images, args.sample_size)
        images.sort()

    try:
        from ultralytics import YOLO
    except ImportError as error:
        print(
            "Ultralytics is required. Install dependencies with: "
            "python -m pip install ultralytics onnxruntime",
            file=sys.stderr,
        )
        print(f"Import error: {error}", file=sys.stderr)
        return 2

    models: list[tuple[str, Any]] = []
    for label, model_path in (("old_model", old_model_path), ("new_model", new_model_path)):
        try:
            print(f"Loading {label}: {model_path}")
            models.append((label, YOLO(str(model_path))))
        except Exception as error:
            print(f"Failed to load {label} ({model_path}): {error}", file=sys.stderr)
            return 2

    output_path = args.output.expanduser()
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        prediction_errors = 0
        with output_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
            writer.writeheader()

            for index, image_path in enumerate(images, start=1):
                row: dict[str, Any] = {"image": image_path.relative_to(image_dir).as_posix()}
                for prefix, model in models:
                    try:
                        summary = summarize(model_detections(model, image_path, args.confidence))
                        for key, value in summary.items():
                            row[f"{prefix}_{key}"] = value
                        row[f"{prefix}_error"] = ""
                    except Exception as error:
                        prediction_errors += 1
                        row.update(
                            {
                                f"{prefix}_detection_count": "",
                                f"{prefix}_classes": "",
                                f"{prefix}_class_counts": "",
                                f"{prefix}_average_confidence": "",
                                f"{prefix}_error": str(error),
                            }
                        )
                        print(
                            f"Failed on {image_path} with {prefix}: {error}",
                            file=sys.stderr,
                        )
                writer.writerow(row)
                print(f"Processed {index}/{len(images)}: {image_path.name}")
    except OSError as error:
        print(f"Could not write comparison CSV ({output_path}): {error}", file=sys.stderr)
        return 2

    print(f"Compared {len(images)} image(s). Results: {output_path.resolve()}")
    if prediction_errors:
        print(
            f"{prediction_errors} model inference error(s) were recorded in the CSV.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
