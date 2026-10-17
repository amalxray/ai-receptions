# Dental model training

## Dataset review

The selected candidate is [Roboflow dental-x-ray-panoramic v2](https://universe.roboflow.com/opg-unbmz/dental-x-ray-panoramic/dataset/2), a panoramic X-ray object-detection dataset with 13,817 images, 31 classes, including `Caries`, `Filling`, and `Root Canal Treatment`. The page identifies CC BY 4.0 and version 2. Its published model reports mAP@50 28.0%, precision 37.6%, and recall 31.6%; those low results are a reason to validate carefully, not a medical quality guarantee.

Roboflow requires an API key to download the YOLOv8 export. No key is configured in the shell or project environment, so the dataset was not downloaded and no training was started. Export the exact version above to `ai-engine/training/dataset` in YOLOv8 format after setting `ROBOFLOW_API_KEY` in the shell (never commit the key). Verify the exported `data.yaml` class order matches the `names` list in this directory before proceeding.

For comparison, [DENTEX](https://huggingface.co/datasets/ibrahimhamamci/DENTEX) contains 1,005 fully annotated panoramas and diagnosis labels including caries, deep caries, periapical lesions, and impacted teeth, but its license is CC BY-NC-SA 4.0 (non-commercial). It uses hierarchical JSON annotations, not YOLO text labels; its public validation split has no ground truth. The three archives total about 12.0 GB. It is not selected for this pipeline because adapting its annotations and making a defensible validation split requires additional work and licensing limits.

The local machine currently has no visible CUDA GPU, about 4.2 GB available RAM, and 39.6 GB free disk. Training on CPU is possible but will be slow. Do not create a random validation split from a dataset if patient identity/grouping is available; prevent patient-level leakage.

## Environment

Use the project virtual environment that already has Ultralytics installed:

```sh
.venv/bin/python -c "import torch, ultralytics; print(torch.__version__, ultralytics.__version__, torch.cuda.is_available())"
```

To download a Roboflow Universe export, create a Roboflow API key and set `ROBOFLOW_API_KEY` in the shell (do not commit it). Use a dataset version that explicitly contains panoramic radiographs and the diagnosis classes required by the task. Verify its license and annotations before training.

## YOLO data YAML

Once the Roboflow export is downloaded and independently verified into the directory layout below, use [data.yaml](data.yaml). Paths are relative to this directory. The labels must be YOLO detection text files, one object per line:

```text
class_id x_center y_center width height
```

All coordinates must be normalized to `[0, 1]`; IDs must match the `names` array. Do not treat missing/partial annotations as negative images.

## Training

Only after the dataset has a valid train/validation split and licensing review, run from the repository root:

```sh
.venv/bin/yolo train model=yolov8n.pt data=ai-engine/training/data.yaml epochs=100 imgsz=640 device=cpu batch=2 project=ai-engine/training/runs name=dental-caries-v1
```

CPU training on panoramic images may take a long time. Keep the model in the run directory until validation passes. Copy `best.pt` to `ai-engine/models/dental-caries-v1.pt` only after checking per-class metrics, held-out patient-level validation, and false-negative examples. The requested mAP50-95 > 0.7 is a target, not a guaranteed result; do not select a confidence threshold to force that score.

## Clinical validation gate

Report mAP50, mAP50-95, per-class precision/recall, sensitivity at clinically relevant operating points, and patient-level split details. Have qualified dental radiologists review false negatives and localization. An internal test score is not evidence of clinical safety or authorization for diagnosis.