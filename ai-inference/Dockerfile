FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    MODEL_PATH=/app/models/best_model_upgraded.onnx \
    HF_HOME=/tmp/huggingface \
    IMAGE_SIZE=1024 \
    ORT_INTRA_OP_THREADS=2 \
    PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends locales \
    && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --requirement requirements.txt

RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser main.py .
COPY --chown=appuser:appuser models/best_model_upgraded.onnx ./models/best_model_upgraded.onnx

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8000') + '/health', timeout=3)"

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1"]
