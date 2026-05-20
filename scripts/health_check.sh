#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:8000}"
curl -fsS "${BASE_URL}/health" | grep -q '"status":"ok"' || exit 1
curl -fsS "${BASE_URL}/config" | grep -q '"app_id"' || exit 1
curl -fsS "${BASE_URL}/price" | grep -q '"algo_usd"' || exit 1
echo "All health checks passed."
