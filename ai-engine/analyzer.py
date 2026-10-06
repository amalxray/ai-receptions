#!/usr/bin/env python3
"""Local medical image analyzer.

The public engine is intentionally dependency-light: it loads Ultralytics YOLO
when available, uses OpenCV to normalize inputs, and exposes a deterministic
CLI/test mode for local verification. Missing ML dependencies do not crash the
application; they return a structured "unavailable" result.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


def _safe_imports() -> dict[str, Any]:
    imports: dict[str, Any] = {}
    try:
        import cv2  # type: ignore  # noqa: F401
        imports["opencv"] = cv2
    except Exception as exc:  # pragma: no cover - runtime environment check
        imports["opencv_error"] = str(exc)
    try:
        import pydicom  # type: ignore  # noqa: F401
        imports["pydicom"] = pydicom
    except Exception as exc:  # pragma: no cover - runtime environment check
        imports["pydicom_error"] = str(exc)
    try:
        from ultralytics import YOLO  # type: ignore
        imports["yolo"] = YOLO
    except Exception as exc:  # pragma: no cover - runtime environment check
        imports["yolo_error"] = str(exc)
    return imports


@dataclass
class Detection:
    class_name: str
    confidence: float
    x: float
    y: float
    width: float
    height: float


@dataclass
class AnalysisResult:
    status: str
    provider: str
    image_path: str
    width: int
    height: int
    detections: list[Detection]
    warning: str | None = None
    environment: dict[str, str] = None  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "provider": self.provider,
            "image_path": self.image_path,
            "width": self.width,
            "height": self.height,
            "detections": [asdict(item) for item in self.detections],
            "warning": self.warning,
            "environment": self.environment or {},
        }


def _detect_available_model() -> str:
    candidates = [
        os.getenv("AI_ANALYSIS_MODEL"),
        "yolov8n.pt",
        "/models/yolov8n.pt",
        "yolov8m.pt",
    ]
    return next((item for item in candidates if item), "yolov8n.pt")


def _load_model(model_name: str, yolo_factory: Any) -> Any:
    return yolo_factory(model_name)


def analyze_image(image_path: str) -> dict[str, Any]:
    imports = _safe_imports()
    file_path = Path(image_path).expanduser().resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    if "yolo_error" in imports:
        return AnalysisResult(
            status="unavailable",
            provider="local-python",
            image_path=str(file_path),
            width=0,
            height=0,
            detections=[],
            warning="YOLO runtime is unavailable. Install ai-engine/requirements.txt to enable analysis.",
            environment={
                "opencv": "missing" if "opencv_error" in imports else "available",
                "pydicom": "missing" if "pydicom_error" in imports else "available",
                "ultralytics": "missing",
            },
        ).to_dict()

    yolo_factory = imports["yolo"]
    model = _load_model(_detect_available_model(), yolo_factory)
    result = model(str(file_path), verbose=False, conf=0.25)
    detections: list[Detection] = []
    for item in result:
        boxes = item.boxes
        if boxes is None:
            continue
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            confidence = float(box.conf[0])
            class_id = int(box.cls[0])
            names = item.names or {}
            detections.append(Detection(
                class_name=str(names.get(class_id, "unknown")),
                confidence=confidence,
                x=float(xyxy[0]),
                y=float(xyxy[1]),
                width=float(xyxy[2] - xyxy[0]),
                height=float(xyxy[3] - xyxy[1]),
            ))

    width = 0
    height = 0
    if "opencv" in imports:
        cv2 = imports["opencv"]
        image = cv2.imread(str(file_path))
        if image is not None:
            height, width = image.shape[:2]

    return AnalysisResult(
        status="ok" if detections else "no_detections",
        provider="yolov8",
        image_path=str(file_path),
        width=width,
        height=height,
        detections=detections,
        environment={
            "opencv": "available",
            "pydicom": "available" if "pydicom" in imports else "missing",
            "ultralytics": "available",
        },
    ).to_dict()


def _test_mode() -> dict[str, Any]:
    imports = _safe_imports()
    return {
        "status": "ok",
        "provider": "local-python",
        "warning": "Test mode does not run model inference.",
        "environment": {
            "opencv": "available" if "opencv" in imports else "missing",
            "pydicom": "available" if "pydicom" in imports else "missing",
            "ultralytics": "available" if "yolo" in imports else "missing",
        },
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze medical images locally.")
    parser.add_argument("image", nargs="?", help="Path to an image file.")
    parser.add_argument("--test", action="store_true", help="Run the local engine test mode.")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.test:
        print(json.dumps(_test_mode(), ensure_ascii=False))
        return 0
    if not args.image:
        print("An image path is required.", file=sys.stderr)
        return 2
    try:
        print(json.dumps(analyze_image(args.image), ensure_ascii=False))
        return 0
    except Exception as exc:  # pragma: no cover - CLI contract
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
