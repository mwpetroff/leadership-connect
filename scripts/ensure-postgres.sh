#!/usr/bin/env bash
# Start local PostgreSQL and ensure the Touchpoint database exists.
# Idempotent. Uses peer auth (unix socket) — no password in the connection string.
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-postgres://ubuntu@/touchpoint?host=/var/run/postgresql}"

start_cluster() {
  if command -v pg_isready >/dev/null 2>&1 && pg_isready -q; then
    return 0
  fi

  if command -v pg_ctlcluster >/dev/null 2>&1; then
    local ver
    ver="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1 {print $1}')"
    ver="${ver:-16}"
    sudo pg_ctlcluster "$ver" main start 2>/dev/null || sudo pg_ctlcluster "$ver" main restart || true
  elif command -v service >/dev/null 2>&1; then
    sudo service postgresql start || true
  fi

  local i
  for i in $(seq 1 30); do
    if command -v pg_isready >/dev/null 2>&1 && pg_isready -q; then
      return 0
    fi
    sleep 1
  done

  echo "PostgreSQL did not become ready on port 5432" >&2
  return 1
}

ensure_role_and_db() {
  # Peer-auth as the current OS user. Create a matching DB role if needed.
  local me
  me="$(whoami)"

  if ! psql -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='${me}'" 2>/dev/null | grep -q 1; then
    sudo -u postgres createuser -s "$me" 2>/dev/null || \
      sudo -u postgres psql -d postgres -c "CREATE ROLE ${me} WITH LOGIN SUPERUSER;"
  fi

  if ! psql -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='touchpoint'" | grep -q 1; then
    createdb touchpoint
  fi
}

start_cluster
ensure_role_and_db
echo "PostgreSQL ready (DATABASE_URL=${DATABASE_URL})"
