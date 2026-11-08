# Model comparison

`compare_models.py` compares two Ultralytics-compatible models (for example, an
old 52-class ONNX model and a new 83-class ONNX model) on the same random sample
of images. It writes one CSV row per image with each model's detection count,
detected classes and class counts, and average confidence.

## Requirements

Python 3.9 or newer, Ultralytics, and ONNX Runtime for ONNX models:

```bash
python -m pip install ultralytics onnxruntime
```

## Run

From the repository root:

```bash
python scripts/compare_models.py \
  --image-dir "/path/to/panorama-images" \
  --old-model "/path/to/old-model.onnx" \
  --new-model "/path/to/new-model.onnx"
```

On Windows, use the same command with Windows paths, for example
`--image-dir "D:\datasets\panoramas"`.

The script selects up to 100 images recursively by default and writes
`comparison_results.csv` in the current directory. Use `--sample-size` to
change the limit, `--seed` to make the random sample reproducible, `--confidence`
to set the same minimum confidence for both models, or `--output` to choose a
different CSV path. If the image folder contains fewer images than the sample
size, all supported images are processed.

```bash
python scripts/compare_models.py --help
```

Supported image extensions: BMP, JPEG, JPG, PNG, TIF, TIFF, and WEBP. The CSV
also records per-model inference errors; the script exits with a non-zero status
if any occur.
