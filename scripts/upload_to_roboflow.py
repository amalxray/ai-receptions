#!/usr/bin/env python3
"""يرفع أوزان YOLOv8 إلى مشروع Roboflow ويجهّزها لاستخدام Label Assist."""

from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from roboflow import Roboflow
from roboflow.util.model_processor import package_custom_weights


for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT_DIR / ".env"
DEFAULT_MODEL_PATH = Path(
    "runs/detect/runs/dental_gtx1650-3/weights/best.pt"
)
DEFAULT_PROJECT_NAME = "amal-x-ray-center"
MODEL_VERSION_NAME = "yolov8n-dental-v1"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("رفع_نموذج_روبو_فلو")


class UploadError(Exception):
    """خطأ متوقع أثناء التحقق أو الرفع إلى Roboflow."""


def safe_error_message(error: Exception, api_key: str = "") -> str:
    """يحجب مفتاح API إذا ظهر ضمن نص خطأ صادر عن المكتبة."""
    message = str(error)
    if api_key:
        message = message.replace(api_key, "[مفتاح محجوب]")
    return message


def resolve_model_path() -> Path:
    """يحل مسار الوزن نسبةً إلى جذر المشروع، لا إلى مجلد التشغيل."""
    configured_path = os.getenv("MODEL_PATH", "").strip()
    model_path = Path(configured_path) if configured_path else DEFAULT_MODEL_PATH
    if not model_path.is_absolute():
        model_path = ROOT_DIR / model_path
    return model_path.resolve()


def normalized_project_name(value: str) -> str:
    """يوحّد تنسيق الاسم عند مطابقته مع معرّف مشروع Roboflow."""
    return value.strip().lower().replace("_", "-").replace(" ", "-")


def find_project(workspace: Any, project_name: str) -> dict[str, Any] | None:
    """يبحث عن المشروع بالاسم الظاهر أو بالجزء الأخير من معرّفه."""
    wanted_name = normalized_project_name(project_name)
    for project in getattr(workspace, "project_list", []):
        project_id = str(project.get("id", "")).rstrip("/").split("/")[-1]
        listed_name = normalized_project_name(str(project.get("name", "")))
        if wanted_name in {listed_name, normalized_project_name(project_id)}:
            return project
    return None


def ensure_project(rf: Roboflow, workspace: Any, project_name: str, workspace_name: str) -> tuple[Any, dict[str, Any]]:
    """يجد المشروع المطلوب، أو ينشئ مشروع كشف أجسام خاصاً ثم يعيد تحميل مساحة العمل."""
    project = find_project(workspace, project_name)
    if project is not None:
        logger.info("تم العثور على المشروع «%s» في مساحة العمل.", project_name)
        return workspace, project

    logger.info("المشروع «%s» غير موجود؛ جارٍ إنشاء مشروع كشف أجسام خاص.", project_name)
    try:
        workspace.create_project(
            project_name=project_name,
            project_type="object-detection",
            project_license="Private",
            annotation=project_name,
        )
        workspace = rf.workspace(workspace_name or None)
    except Exception as error:
        details = safe_error_message(error, os.getenv("ROBOFLOW_API_KEY", "").strip())
        raise UploadError(f"تعذر إنشاء المشروع في Roboflow: {details}") from error

    project = find_project(workspace, project_name)
    if project is None:
        raise UploadError(
            "أُرسل طلب إنشاء المشروع، لكن تعذّر العثور عليه بعد تحديث مساحة العمل. "
            "تحقق من صلاحيات الحساب واسم مساحة العمل."
        )
    return workspace, project


def upload_model(workspace: Any, project: dict[str, Any], model_path: Path, api_key: str) -> None:
    """يجهّز الأوزان مع السماح باختلاف الإصدار، ثم يرفعها إلى Roboflow."""
    raw_project_id = str(project.get("id", "")).strip("/")
    project_id = raw_project_id.split("/")[-1]
    if not project_id:
        raise UploadError("لم يُرجع Roboflow معرّفاً صالحاً للمشروع.")

    sdk_output = StringIO()
    logger.info("جارٍ تجهيز ورفع النموذج «%s» إلى المشروع.", MODEL_VERSION_NAME)

    try:
        # تُستخدم نسخة مؤقتة حتى لا يكتب SDK ملفات التجهيز بجانب الأوزان الأصلية.
        with tempfile.TemporaryDirectory(prefix="roboflow-yolo-upload-") as temp_dir:
            temporary_model = Path(temp_dir) / model_path.name
            shutil.copy2(model_path, temporary_model)
            package_dir = Path(temp_dir) / "package"
            package_dir.mkdir()
            with redirect_stdout(sdk_output), redirect_stderr(sdk_output):
                bundle = package_custom_weights(
                    model_type="yolov8",
                    model_path=str(temporary_model.parent),
                    filename=temporary_model.name,
                    build_dir=package_dir,
                    allow_dependency_mismatch=True,
                )
                workspace._upload_zip(
                    model_type=bundle.model_type,
                    model_path=str(bundle.archive_path.parent),
                    project_ids=[project_id],
                    model_name=MODEL_VERSION_NAME,
                    model_file_name=bundle.archive_path.name,
                )
    except Exception as error:
        details = safe_error_message(error, api_key)
        output = sdk_output.getvalue().strip()
        if output:
            logger.error("تفاصيل استجابة Roboflow: %s", safe_error_message(Exception(output), api_key)[:1500])
        raise UploadError(f"فشل تجهيز النموذج أو رفعه: {details}") from error

    # بعض إصدارات SDK تطبع أخطاء الرفع ولا ترفع استثناءً؛ لا نعدّ ذلك نجاحاً.
    output = sdk_output.getvalue()
    if "View the status of your deployment" not in output:
        details = safe_error_message(Exception(output.strip()), api_key)
        if details:
            logger.error("تفاصيل استجابة Roboflow: %s", details[:1500])
        raise UploadError(
            "لم يؤكد Roboflow اكتمال رفع النموذج. راجع تفاصيل الاستجابة أعلاه "
            "وتحقق من الاتصال وصلاحية المشروع."
        )

    logger.info("أكد Roboflow استلام النموذج وربطه بالمشروع.")


def main() -> int:
    """يتحقق من الإعدادات ثم يرفع النموذج ويعرض خطوات استخدامه في Label Assist."""
    load_dotenv(dotenv_path=ENV_FILE, override=False)

    model_path = resolve_model_path()
    if not model_path.is_file():
        logger.error("ملف النموذج غير موجود: %s", model_path)
        logger.error("تحقق من MODEL_PATH في ملف .env.")
        return 1

    api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        logger.error("ROBOFLOW_API_KEY فارغ. أضف مفتاح Roboflow إلى ملف .env ثم أعد التشغيل.")
        return 1

    project_name = os.getenv("ROBOFLOW_PROJECT_NAME", "").strip() or DEFAULT_PROJECT_NAME
    workspace_name = os.getenv("ROBOFLOW_WORKSPACE", "").strip()

    try:
        logger.info("جارٍ الاتصال بـ Roboflow والتحقق من مفتاح API.")
        rf = Roboflow(api_key=api_key)
        workspace = rf.workspace(workspace_name or None)
        logger.info("تم التحقق من المفتاح والاتصال بمساحة العمل.")

        workspace, project = ensure_project(rf, workspace, project_name, workspace_name)
        upload_model(workspace, project, model_path, api_key)

        workspace_slug = str(getattr(workspace, "url", "")).strip("/")
        project_slug = str(project.get("id", "")).strip("/").split("/")[-1]
        if not workspace_slug or not project_slug:
            raise UploadError(
                "اكتمل الرفع، لكن تعذّر تكوين رابط المشروع من بيانات Roboflow."
            )
        project_url = f"https://app.roboflow.com/{workspace_slug}/{project_slug}"

        logger.info("اكتمل رفع النموذج بنجاح.")
        logger.info("اسم النموذج: %s", MODEL_VERSION_NAME)
        logger.info("رابط المشروع: %s", project_url)
        logger.info(
            "لإكمال Label Assist: افتح المشروع، ثم Annotate، ثم افتح صورة واضغط "
            "أداة العصا السحرية، واختر النموذج من Your Models."
        )
        return 0
    except Exception as error:
        details = safe_error_message(error, api_key)
        lowered = details.lower()
        if "401" in lowered or "unauthorized" in lowered or "api key" in lowered:
            logger.error("رفض Roboflow مفتاح API. تحقق من ROBOFLOW_API_KEY وصلاحياته.")
        else:
            logger.error("تعذر إكمال عملية Roboflow: %s", details)
        return 1


if __name__ == "__main__":
    sys.exit(main())
