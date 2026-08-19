#!/usr/bin/env bash
# Per-boot: Postgres + migrations + seed, then API (background) and Vite (foreground).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://ubuntu@/touchpoint?host=/var/run/postgresql}"
export NODE_ENV="${NODE_ENV:-development}"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:8080}"

"$ROOT/scripts/ensure-postgres.sh"
"$ROOT/scripts/apply-migrations.sh"
"$ROOT/scripts/seed-local-dev.sh"

if curl -sf "http://127.0.0.1:8080/api/healthz" >/dev/null 2>&1; then
  echo "API already healthy on :8080"
else
  if [ ! -f "$ROOT/artifacts/api-server/dist/index.mjs" ]; then
    pnpm --filter @workspace/api-server run build
  fi
  PORT=8080 NODE_ENV=development DATABASE_URL="$DATABASE_URL" \
    node --enable-source-maps "$ROOT/artifacts/api-server/dist/index.mjs" &
  for _ in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:8080/api/healthz" >/dev/null 2>&1; then
      echo "API listening on :8080"
      break
    fi
    sleep 1
  done
  if ! curl -sf "http://127.0.0.1:8080/api/healthz" >/dev/null 2>&1; then
    echo "API failed to become healthy on :8080" >&2
    exit 1
  fi
fi

export PORT="${PORT:-20001}"
export BASE_PATH="${BASE_PATH:-/}"
exec pnpm --filter @workspace/connect run dev
