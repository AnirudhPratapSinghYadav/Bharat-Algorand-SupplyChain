#!/usr/bin/env bash
# Pramanik one-command TestNet deploy + optional local servers.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${ORACLE_MNEMONIC:-}" ]]; then
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
fi

if [[ -z "${ORACLE_MNEMONIC:-}" ]]; then
  echo "ORACLE_MNEMONIC is required (25-word TestNet account)." >&2
  exit 1
fi

echo "==> Full deploy (build, deploy, fund, .env, seed)"
python scripts/full_deploy.py "$@"

if [[ "${START_SERVERS:-1}" == "1" ]]; then
  echo "==> Starting API on :8000"
  uvicorn app:app --host 0.0.0.0 --port 8000 &
  API_PID=$!
  echo "==> Starting frontend on :5173"
  (cd frontend && npm ci && npm run dev) &
  FE_PID=$!
  trap 'kill $API_PID $FE_PID 2>/dev/null || true' EXIT
  echo "API pid=$API_PID  Frontend pid=$FE_PID"
  echo "Open http://localhost:5173"
  wait
fi
