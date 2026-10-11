#!/usr/bin/env bash
set -Eeuo pipefail

: "${AI_HEALTH_URL:?Set AI_HEALTH_URL to the HTTPS /health URL}"
command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

curl --fail --silent --show-error --max-time 10 "$AI_HEALTH_URL"
printf '\n'
