#!/usr/bin/env bash
# Apply lib/db/drizzle/*.sql in filename order, recording applied files.
# drizzle-kit migrate is skipped because the journal jumps 8 → 10 (0009 is a seed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/lib/db/drizzle"
export DATABASE_URL="${DATABASE_URL:-postgres://ubuntu@/touchpoint?host=/var/run/postgresql}"

psql -d touchpoint -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# If this database already has the Touchpoint schema but no migration journal
# (applied by hand), record existing files once so CREATE TYPE is not re-run.
# Only do this when the journal is empty — otherwise new files would be
# marked applied without running.
if [ "$(psql -d touchpoint -Atqc "SELECT count(*) FROM schema_migrations")" = "0" ] \
  && [ "$(psql -d touchpoint -Atqc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='department_id'")" = "1" ]; then
  for f in "$DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
    name="$(basename "$f")"
    psql -d touchpoint -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (filename) VALUES ('${name}') ON CONFLICT DO NOTHING;"
  done
fi

# Drop the old free-text GIN index before 0011 if a prior 0007 created it.
psql -d touchpoint -v ON_ERROR_STOP=1 -c "DROP INDEX IF EXISTS people_department_trgm_idx;"

shopt -s nullglob
for f in "$DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
  name="$(basename "$f")"
  applied="$(psql -d touchpoint -Atqc "SELECT 1 FROM schema_migrations WHERE filename='${name}'")"
  if [ "$applied" = "1" ]; then
    echo "skip $name"
    continue
  fi
  echo "apply $name"
  psql -d touchpoint -v ON_ERROR_STOP=1 -f "$f"
  psql -d touchpoint -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (filename) VALUES ('${name}');"
done

echo "Migrations up to date"
