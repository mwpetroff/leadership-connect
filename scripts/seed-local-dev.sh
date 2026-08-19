#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgres://ubuntu@/touchpoint?host=/var/run/postgresql}"
psql -d touchpoint -v ON_ERROR_STOP=1 -f "$ROOT/scripts/seed-local-dev.sql"
echo "Local preview seed applied"
