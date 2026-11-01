from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import secrets
import time
import warnings
from collections import deque
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError


DEFAULT_CLASS_NAMES = [
    "bone_loss",
    "caries",
    "crown",
    "cyst",
    "filling",
    "fracture_teeth",
    "implant",
    "malaligned",
    "mandibular_canal",
    "missing_teeth",
    "periapical_lesion",
    "permanent_teeth",
    "primary_teeth",
    "retained_root",
    "root_canal_treatment",
    "root_piece",
    "root_resorption",
    "supra_eruption",
    "tad",
    "abutment",
    "attrition",
    "bone_defect",
    "gingival_former",
    "impacted_tooth",
    "maxillary_sinus",
    "metal_band",
    "orthodontic_brackets",
    "permanent_retainer",
    "plating",
    "post_core",
    "wire",
    "amalgam_restoration",
    "composite_restoration",
    "dental_caries",
    "dental_crown",
    "dental_implant",
    "endodontic_post",
    "endodontic_treatment",
    "fractured_tooth",
    "inferior_alveolar_nerve",
    "interdental_bone_loss",
    "mental_foramen",
    "orthodontic_retainer_wire",
    "permenant_tooth_bud",
    "primary_tooth",
    "proximal_dental_caries",
    "pulp_canal_obliteration",
    "pulpectomy_chamber",
    "root_caries",
    "space_maintainer",
    "taurodontism",
    "temporary_restoration",
]

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ai-inference")

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "40000000"))
IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "1024"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.50"))
MAX_DETECTIONS = int(os.getenv("MAX_DETECTIONS", "100"))
MAX_CANDIDATES = int(os.getenv("MAX_CANDIDATES", "3000"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
MODEL_PATH = os.getenv("MODEL_PATH", "/models/best_model_upgraded.onnx")
HF_MODEL_REPO_ID = os.getenv("HF_MODEL_REPO_ID", "")
HF_MODEL_FILENAME = os.getenv("HF_MODEL_FILENAME", "best_model_upgraded.onnx")
HF_TOKEN = os.getenv("HF_TOKEN")
MODEL_VERSION = os.getenv("MODEL_VERSION", "dental-yolo-52class")
API_KEY = os.getenv("INFERENCE_API_KEY", "")
ORT_INTRA_OP_THREADS = int(os.getenv("ORT_INTRA_OP_THREADS", "2"))
ENABLE_API_DOCS = os.getenv("ENABLE_API_DOCS", "false").lower() == "true"

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)

try:
    configured_names = os.getenv("MODEL_CLASS_NAMES_JSON")
    CLASS_NAMES = json.loads(configured_names) if configured_names else DEFAULT_CLASS_NAMES
except json.JSONDecodeError as exc:
    raise RuntimeError("MODEL_CLASS_NAMES_JSON must be a JSON array.") from exc

if (
    not isinstance(CLASS_NAMES, list)
    or not CLASS_NAMES
    or any(not isinstance(name, str) or not name.strip() for name in CLASS_NAMES)
):
    raise RuntimeError("Model class names must be a non-empty array of strings.")
if not API_KEY or len(API_KEY) < 32:
    raise RuntimeError("INFERENCE_API_KEY must contain at least 32 characters.")
if MAX_UPLOAD_BYTES <= 0 or MAX_IMAGE_PIXELS <= 0 or IMAGE_SIZE <= 0:
    raise RuntimeError("Image and upload limits must be positive.")
if not 0 < CONFIDENCE_THRESHOLD <= 1 or not 0 < IOU_THRESHOLD <= 1:
    raise RuntimeError("Confidence and IoU thresholds must be between 0 and 1.")
if min(MAX_DETECTIONS, MAX_CANDIDATES, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS) <= 0:
    raise RuntimeError("Detection and rate-limit settings must be positive.")

_request_times: deque[float] = deque()
_rate_lock = asyncio.Lock()


def _resolve_model_path() -> str:
    if HF_MODEL_REPO_ID:
        from huggingface_hub import hf_hub_download

        return hf_hub_download(
            repo_id=HF_MODEL_REPO_ID,
            filename=HF_MODEL_FILENAME,
            token=HF_TOKEN or None,
        )
    return MODEL_PATH


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_path = _resolve_model_path()
    if not os.path.isfile(model_path):
        raise RuntimeError(
            "ONNX model is unavailable. Set HF_MODEL_REPO_ID or provide "
            f"MODEL_PATH pointing to an existing file: {model_path}"
        )
    if "CPUExecutionProvider" not in ort.get_available_providers():
        raise RuntimeError("ONNX Runtime CPUExecutionProvider is unavailable.")

    options = ort.SessionOptions()
    options.intra_op_num_threads = ORT_INTRA_OP_THREADS
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(
        model_path,
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    model_input = session.get_inputs()[0]
    expected_shape = [1, 3, IMAGE_SIZE, IMAGE_SIZE]
    if model_input.shape != expected_shape:
        raise RuntimeError(
            f"Expected fixed ONNX input {expected_shape}, got {model_input.shape}."
        )
    output_shape = session.get_outputs()[0].shape
    expected_channels = len(CLASS_NAMES) + 4
    if (
        len(output_shape) != 3
        or expected_channels not in output_shape[1:]
    ):
        raise RuntimeError(
            f"Expected ONNX output with {expected_channels} channels for "
            f"{len(CLASS_NAMES)} classes, got {output_shape}."
        )

    app.state.session = session
    app.state.input_name = model_input.name
    app.state.inference_lock = asyncio.Semaphore(1)
    logger.info(
        "Loaded ONNX model version %s with %d classes on CPUExecutionProvider.",
        MODEL_VERSION,
        len(CLASS_NAMES),
    )
    yield


app = FastAPI(
    title="Dental image inference",
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url="/redoc" if ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
    lifespan=lifespan,
)


async def _allow_request() -> bool:
    now = time.monotonic()
    window = float(RATE_LIMIT_WINDOW_SECONDS)
    async with _rate_lock:
        while _request_times and now - _request_times[0] >= window:
            _request_times.popleft()
        if len(_request_times) >= RATE_LIMIT_REQUESTS:
            return False
        _request_times.append(now)
        return True


def _preprocess(image_bytes: bytes) -> tuple[np.ndarray, int, int, float, int, int]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            source.verify()
        with Image.open(io.BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=413, detail="Image dimensions exceed the limit.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Unsupported or invalid image.") from exc

    width, height = image.size
    scale = min(IMAGE_SIZE / width, IMAGE_SIZE / height)
    resized_width = max(1, round(width * scale))
    resized_height = max(1, round(height * scale))
    image = image.resize((resized_width, resized_height), Image.Resampling.BILINEAR)

    left = (IMAGE_SIZE - resized_width) // 2
    top = (IMAGE_SIZE - resized_height) // 2
    canvas = Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE), (114, 114, 114))
    canvas.paste(image, (left, top))
    tensor = np.asarray(canvas, dtype=np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, width, height, scale, left, top


def _nms(boxes: np.ndarray, scores: np.ndarray, threshold: float) -> list[int]:
    order = np.argsort(scores)[::-1]
    kept: list[int] = []
    while order.size:
        current = int(order[0])
        kept.append(current)
        if order.size == 1:
            break

        remaining = order[1:]
        x1 = np.maximum(boxes[current, 0], boxes[remaining, 0])
        y1 = np.maximum(boxes[current, 1], boxes[remaining, 1])
        x2 = np.minimum(boxes[current, 2], boxes[remaining, 2])
        y2 = np.minimum(boxes[current, 3], boxes[remaining, 3])
        intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
        area_current = max(0.0, boxes[current, 2] - boxes[current, 0]) * max(
            0.0, boxes[current, 3] - boxes[current, 1]
        )
        area_remaining = np.maximum(0, boxes[remaining, 2] - boxes[remaining, 0]) * np.maximum(
            0, boxes[remaining, 3] - boxes[remaining, 1]
        )
        union = area_current + area_remaining - intersection
        iou = np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 0)
        order = remaining[iou <= threshold]
    return kept


def _postprocess(
    output: Any,
    width: int,
    height: int,
    scale: float,
    pad_x: int,
    pad_y: int,
) -> list[dict[str, Any]]:
    predictions = np.asarray(output)
    if predictions.ndim == 3:
        if predictions.shape[0] != 1:
            raise RuntimeError("Only batch size 1 is supported.")
        predictions = predictions[0]
    expected_channels = 4 + len(CLASS_NAMES)
    if predictions.ndim != 2:
        raise RuntimeError(f"Unexpected ONNX output dimensions: {predictions.shape}.")
    if predictions.shape[0] == expected_channels:
        predictions = predictions.T
    elif predictions.shape[1] != expected_channels:
        raise RuntimeError(f"Unexpected ONNX output shape: {predictions.shape}.")
    if predictions.shape[1] != expected_channels:
        raise RuntimeError(f"ONNX output does not match {len(CLASS_NAMES)} model classes.")

    scores_by_class = predictions[:, 4:]
    class_ids = np.argmax(scores_by_class, axis=1)
    scores = scores_by_class[np.arange(scores_by_class.shape[0]), class_ids]
    valid = np.isfinite(scores) & (scores >= CONFIDENCE_THRESHOLD)
    candidate_indices = np.flatnonzero(valid)
    if candidate_indices.size > MAX_CANDIDATES:
        best = np.argpartition(scores[candidate_indices], -MAX_CANDIDATES)[-MAX_CANDIDATES:]
        candidate_indices = candidate_indices[best]
    if candidate_indices.size == 0:
        return []

    selected = predictions[candidate_indices]
    boxes = np.empty((selected.shape[0], 4), dtype=np.float32)
    boxes[:, 0] = selected[:, 0] - selected[:, 2] / 2
    boxes[:, 1] = selected[:, 1] - selected[:, 3] / 2
    boxes[:, 2] = selected[:, 0] + selected[:, 2] / 2
    boxes[:, 3] = selected[:, 1] + selected[:, 3] / 2
    selected_scores = scores[candidate_indices]
    selected_classes = class_ids[candidate_indices]

    keep: list[int] = []
    for class_id in np.unique(selected_classes):
        class_indices = np.flatnonzero(selected_classes == class_id)
        keep.extend(
            int(class_indices[index])
            for index in _nms(boxes[class_indices], selected_scores[class_indices], IOU_THRESHOLD)
        )
    keep.sort(key=lambda index: float(selected_scores[index]), reverse=True)

    result: list[dict[str, Any]] = []
    for index in keep[:MAX_DETECTIONS]:
        x1, y1, x2, y2 = boxes[index]
        x1 = float(np.clip((x1 - pad_x) / scale, 0, width))
        y1 = float(np.clip((y1 - pad_y) / scale, 0, height))
        x2 = float(np.clip((x2 - pad_x) / scale, 0, width))
        y2 = float(np.clip((y2 - pad_y) / scale, 0, height))
        if x2 <= x1 or y2 <= y1:
            continue
        class_id = int(selected_classes[index])
        result.append(
            {
                "class_id": class_id,
                "class_name": CLASS_NAMES[class_id],
                "confidence": float(selected_scores[index]),
                "box": {
                    "x": x1,
                    "y": y1,
                    "width": x2 - x1,
                    "height": y2 - y1,
                },
            }
        )
    return result


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    if not hasattr(request.app.state, "session"):
        raise HTTPException(status_code=503, detail="Model is not ready.")
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.post("/analyze")
async def analyze(
    request: Request,
    image: UploadFile = File(...),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized.")
    if not await _allow_request():
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
        )

    image_bytes = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image is empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the upload limit.")

    tensor, width, height, scale, pad_x, pad_y = _preprocess(image_bytes)
    try:
        async with request.app.state.inference_lock:
            outputs = await asyncio.to_thread(
                request.app.state.session.run,
                None,
                {request.app.state.input_name: tensor},
            )
        predictions = _postprocess(outputs[0], width, height, scale, pad_x, pad_y)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ONNX inference failed.")
        raise HTTPException(status_code=500, detail="Inference failed.") from exc

    return {
        "model_version": MODEL_VERSION,
        "image_width": width,
        "image_height": height,
        "predictions": predictions,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "7860")),
        workers=1,
    )
