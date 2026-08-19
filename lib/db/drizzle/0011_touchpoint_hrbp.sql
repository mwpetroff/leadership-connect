-- Touchpoint HRBP model: departments, employment status, HRBP assignment, meeting kinds.

CREATE TYPE employment_status AS ENUM ('active', 'inactive');
CREATE TYPE meeting_kind AS ENUM ('general', 'hrbp_1on1', 'leader_1on1', 'skip_level');

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  leadership_one_on_one_days INTEGER,
  skip_level_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promote existing free-text department names into HR-owned records.
INSERT INTO departments (name)
SELECT DISTINCT TRIM(department)
FROM people
WHERE department IS NOT NULL AND TRIM(department) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE people ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS hrbp_id INTEGER REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_hrbp BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS status employment_status NOT NULL DEFAULT 'active';

UPDATE people p
SET department_id = d.id
FROM departments d
WHERE p.department IS NOT NULL AND TRIM(p.department) = d.name;

ALTER TABLE people DROP COLUMN IF EXISTS department;

CREATE INDEX IF NOT EXISTS people_department_id_idx ON people (department_id);
CREATE INDEX IF NOT EXISTS people_hrbp_id_idx ON people (hrbp_id);
CREATE INDEX IF NOT EXISTS people_manager_id_idx ON people (manager_id);
CREATE INDEX IF NOT EXISTS people_status_idx ON people (status);
CREATE INDEX IF NOT EXISTS people_is_hrbp_idx ON people (is_hrbp);

ALTER TABLE virtual_meetings ADD COLUMN IF NOT EXISTS meeting_kind meeting_kind NOT NULL DEFAULT 'general';
