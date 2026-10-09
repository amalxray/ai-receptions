#!/usr/bin/env python3
"""Download the current main dataset and merge local YOLO datasets without uploading."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import shutil
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from roboflow import Roboflow


ROOT_DIR = Path(__file__).resolve().parents[1]
EXTERNAL_DIR = ROOT_DIR / "external_datasets"
WORK_DIR = ROOT_DIR / ".roboflow-work"
MAIN_WORKSPACE = "shadi-ai"
MAIN_PROJECT = "dental-x-ray-panoramic-dataset-zzqid"
IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
SPLITS = ("train", "valid")

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("merge_local_datasets")


def load_classes(dataset_dir: Path) -> list[str]:
    config_path = dataset_dir / "data.yaml"
    if not config_path.is_file():
        raise FileNotFoundError(f"Missing YOLO class configuration: {config_path}")
    with config_path.open(encoding="utf-8") as stream:
        config: dict[str, Any] = yaml.safe_load(stream) or {}

    names = config.get("names")
    if isinstance(names, dict):
        pairs = sorted((int(index), str(name)) for index, name in names.items())
        if [index for index, _ in pairs] != list(range(len(pairs))):
            raise ValueError(f"Class IDs must be contiguous and start at zero: {config_path}")
        classes = [name for _, name in pairs]
    elif isinstance(names, list):
        classes = [str(name) for name in names]
    else:
        raise ValueError(f"Invalid YOLO class names in {config_path}")

    if not classes or any(not name.strip() for name in classes):
        raise ValueError(f"Empty class list or class name in {config_path}")
    if config.get("nc", len(classes)) != len(classes):
        raise ValueError(f"Class count does not match names in {config_path}")
    return classes


def normalize_class(name: str) -> str:
    value = re.sub(r"[\s-]+", "_", name.strip().casefold())
    value = re.sub(r"[^a-z0-9_]", "", value)
    if not value:
        raise ValueError(f"Cannot normalize class name: {name!r}")
    return value


def load_class_mapping() -> dict[str, str]:
    raw = os.environ.get("ROBOFLOW_CLASS_MAPPING", "").strip()
    if not raw:
        return {}
    mapping = json.loads(raw)
    if not isinstance(mapping, dict) or any(
        not isinstance(source, str) or not isinstance(target, str)
        for source, target in mapping.items()
    ):
        raise ValueError("ROBOFLOW_CLASS_MAPPING must be a JSON object of class names.")
    return {
        normalize_class(source): normalize_class(target)
        for source, target in mapping.items()
    }


def image_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        raise FileNotFoundError(f"Missing image directory: {directory}")
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.suffix.casefold() in IMAGE_EXTENSIONS
    )


def build_class_union(
    datasets: dict[str, Path],
    explicit_mapping: dict[str, str],
) -> tuple[list[str], dict[str, dict[int, int]]]:
    class_names = {name: load_classes(path) for name, path in datasets.items()}
    merged_names: OrderedDict[str, None] = OrderedDict()
    remaps: dict[str, dict[int, int]] = {}

    for dataset_name, names in class_names.items():
        remap: dict[int, int] = {}
        for source_id, original_name in enumerate(names):
            normalized = normalize_class(original_name)
            target_name = explicit_mapping.get(normalized, normalized)
            merged_names.setdefault(target_name, None)
            remap[source_id] = list(merged_names).index(target_name)
        remaps[dataset_name] = remap

    return list(merged_names), remaps


def rewrite_labels(
    source: Path,
    destination: Path,
    remap: dict[int, int],
) -> None:
    updated_lines: list[str] = []
    for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split()
        try:
            source_id = int(fields[0])
        except (ValueError, IndexError) as error:
            raise ValueError(f"Invalid YOLO annotation in {source}:{line_number}") from error
        if source_id not in remap or len(fields) < 5:
            raise ValueError(f"Unknown class ID or invalid annotation in {source}:{line_number}")
        updated_lines.append(" ".join([str(remap[source_id]), *fields[1:]]))
    destination.write_text(
        "\n".join(updated_lines) + ("\n" if updated_lines else ""),
        encoding="utf-8",
    )


def stable_safe_stem(dataset_name: str, split: str, image: Path) -> str:
    digest = hashlib.sha256(
        f"{dataset_name}\0{split}\0{image.name}".encode("utf-8")
    ).hexdigest()[:24]
    return f"{dataset_name}_{split}_{digest}"


def merge_dataset(
    dataset_name: str,
    source_dir: Path,
    output_dir: Path,
    class_remap: dict[int, int],
) -> int:
    count = 0
    for split in SPLITS:
        source_images = source_dir / split / "images"
        source_labels = source_dir / split / "labels"
        destination_images = output_dir / split / "images"
        destination_labels = output_dir / split / "labels"
        destination_images.mkdir(parents=True, exist_ok=True)
        destination_labels.mkdir(parents=True, exist_ok=True)

        for image in image_files(source_images):
            source_label = source_labels / f"{image.stem}.txt"
            if not source_label.is_file():
                raise FileNotFoundError(f"Missing label file for image: {image}")
            safe_stem = stable_safe_stem(dataset_name, split, image)
            output_image = destination_images / f"{safe_stem}{image.suffix.lower()}"
            output_label = destination_labels / f"{safe_stem}.txt"
            if output_image.exists() or output_label.exists():
                raise FileExistsError(f"Refusing to overwrite merged sample: {safe_stem}")
            shutil.copy2(image, output_image)
            rewrite_labels(source_label, output_label, class_remap)
            count += 1

    if count == 0:
        raise ValueError(f"No training/validation images found for {dataset_name}")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=WORK_DIR / "local-merged-dataset",
        help="Ignored local output directory for the merged dataset.",
    )
    args = parser.parse_args()
    output_dir = args.output.resolve()
    if output_dir.exists():
        raise FileExistsError(f"Output already exists; refusing to overwrite: {output_dir}")

    external = {
        "dental": EXTERNAL_DIR / "dental",
        "dental_pathology": EXTERNAL_DIR / "dental-pathology-detection-model",
    }
    for path in external.values():
        if not path.is_dir():
            raise FileNotFoundError(f"Expected extracted dataset not found: {path}")

    load_dotenv(ROOT_DIR / ".env", override=False)
    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ROBOFLOW_API_KEY is not available in the process environment.")

    rf = Roboflow(api_key=api_key)
    project = rf.workspace(MAIN_WORKSPACE).project(MAIN_PROJECT)
    versions = project.versions()
    latest = max(versions, key=lambda version: version.created, default=None)
    if latest is None:
        raise RuntimeError("The main Roboflow project has no downloadable dataset versions.")

    run_dir = WORK_DIR / f"merge-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}"
    download_dir = run_dir / "main-download"
    run_dir.mkdir(parents=True)
    logger.info("Downloading main project dataset version %s...", latest.version)
    downloaded = latest.download("yolov8", location=str(download_dir))
    main_dir = Path(downloaded.location).resolve()
    if not main_dir.is_dir():
        raise FileNotFoundError("Roboflow did not produce a local main dataset directory.")

    sources = {"main": main_dir, **external}
    explicit_mapping = load_class_mapping()
    classes, remaps = build_class_union(sources, explicit_mapping)

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(main_dir, output_dir)
    for split in ("train", "valid", "test"):
        labels_dir = output_dir / split / "labels"
        if labels_dir.is_dir():
            for label in labels_dir.glob("*.txt"):
                rewrite_labels(label, label, remaps["main"])

    added_counts: dict[str, int] = {}
    for dataset_name, source_dir in external.items():
        added_counts[dataset_name] = merge_dataset(
            dataset_name,
            source_dir,
            output_dir,
            remaps[dataset_name],
        )

    config = {
        "path": ".",
        "train": "train/images",
        "val": "valid/images",
        "test": "test/images",
        "nc": len(classes),
        "names": classes,
    }
    with (output_dir / "data.yaml").open("w", encoding="utf-8") as stream:
        yaml.safe_dump(config, stream, sort_keys=False, allow_unicode=True)

    attribution = (
        "External source datasets used locally for experimentation:\n"
        "- dental-t7fhr-pzqkl version 1: CC BY 4.0\n"
        "- dental-pathology-detection-model-eqobr version 1: CC BY 4.0\n"
        "Review source terms and complete privacy/de-identification review before "
        "sharing, uploading, or redistributing this dataset.\n"
    )
    (output_dir / "SOURCE_ATTRIBUTION.txt").write_text(attribution, encoding="utf-8")

    logger.info("Merged dataset saved locally: %s", output_dir)
    logger.info("Added images: %s", added_counts)
    logger.info("Classes retained/remapped by explicit name: %s", ", ".join(classes))
    logger.info(
        "No data were uploaded to Roboflow. The external medical images require "
        "privacy/de-identification review before any third-party upload."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logging.getLogger("merge_local_datasets").error("Merge failed: %s", error)
        raise
