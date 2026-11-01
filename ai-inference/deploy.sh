#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose v2 is required." >&2
  exit 1
}
[[ -f .env ]] || {
  echo "Create ai-inference/.env from .env.example first." >&2
  exit 1
}
grep -qE '^HF_MODEL_REPO_ID=.+$' .env || {
  echo "Set HF_MODEL_REPO_ID in ai-inference/.env to the model repository." >&2
  exit 1
}

docker compose up --build --detach --remove-orphans
echo "Containers started. Verify with: AI_HEALTH_URL=https://your-domain/health ./healthcheck.sh"
