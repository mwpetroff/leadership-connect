-- ── Migration: convert single sponsor_id FK → event_sponsors junction table ──

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS event_sponsors (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, person_id)
);

-- 2. Migrate existing single-sponsor rows
INSERT INTO event_sponsors (event_id, person_id)
SELECT id, sponsor_id FROM events WHERE sponsor_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Drop old column
ALTER TABLE events DROP COLUMN IF EXISTS sponsor_id;
