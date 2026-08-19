-- Idempotent local preview directory so My team / coverage clocks have data.
-- Dev-admin bypass authenticates as dev@example.com; matching that email
-- makes the session an assigned HRBP.

INSERT INTO departments (name, parent_id, leadership_one_on_one_days, skip_level_days)
VALUES
  ('AI & Digital Solutions', NULL, NULL, NULL),
  ('Modern Apps', NULL, 14, 90),
  ('People Operations', NULL, 14, 90)
ON CONFLICT (name) DO NOTHING;

UPDATE departments child
SET parent_id = parent.id
FROM departments parent
WHERE child.name = 'Modern Apps'
  AND parent.name = 'AI & Digital Solutions'
  AND child.parent_id IS DISTINCT FROM parent.id;

INSERT INTO people (name, email, title, role, home_city, home_state, is_hrbp, status, department_id)
VALUES
  (
    'Dev Admin',
    'dev@example.com',
    'HR Business Partner',
    'staff',
    'Austin',
    'TX',
    TRUE,
    'active',
    (SELECT id FROM departments WHERE name = 'People Operations')
  )
ON CONFLICT (email) DO UPDATE
SET is_hrbp = TRUE,
    title = EXCLUDED.title,
    department_id = EXCLUDED.department_id;

INSERT INTO people (name, email, title, role, home_city, home_state, is_hrbp, status, department_id, manager_id, hrbp_id)
VALUES
  (
    'Avery Chen',
    'avery.chen@example.com',
    'Chief Executive Officer',
    'executive',
    'Austin',
    'TX',
    FALSE,
    'active',
    (SELECT id FROM departments WHERE name = 'AI & Digital Solutions'),
    NULL,
    (SELECT id FROM people WHERE email = 'dev@example.com')
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO people (name, email, title, role, home_city, home_state, is_hrbp, status, department_id, manager_id, hrbp_id)
VALUES
  (
    'Jordan Blake',
    'jordan.blake@example.com',
    'VP, Modern Apps',
    'secondary_leader',
    'Austin',
    'TX',
    FALSE,
    'active',
    (SELECT id FROM departments WHERE name = 'Modern Apps'),
    (SELECT id FROM people WHERE email = 'avery.chen@example.com'),
    (SELECT id FROM people WHERE email = 'dev@example.com')
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO people (name, email, title, role, home_city, home_state, is_hrbp, status, department_id, manager_id, hrbp_id)
VALUES
  (
    'Sam Rivera',
    'sam.rivera@example.com',
    'Senior Engineer',
    'staff',
    'Austin',
    'TX',
    FALSE,
    'active',
    (SELECT id FROM departments WHERE name = 'Modern Apps'),
    (SELECT id FROM people WHERE email = 'jordan.blake@example.com'),
    (SELECT id FROM people WHERE email = 'dev@example.com')
  ),
  (
    'Riley Patel',
    'riley.patel@example.com',
    'Product Manager',
    'staff',
    'Chicago',
    'IL',
    FALSE,
    'active',
    (SELECT id FROM departments WHERE name = 'Modern Apps'),
    (SELECT id FROM people WHERE email = 'jordan.blake@example.com'),
    (SELECT id FROM people WHERE email = 'dev@example.com')
  )
ON CONFLICT (email) DO NOTHING;

UPDATE people
SET hrbp_id = (SELECT id FROM people WHERE email = 'dev@example.com')
WHERE email IN ('avery.chen@example.com', 'jordan.blake@example.com', 'sam.rivera@example.com', 'riley.patel@example.com')
  AND hrbp_id IS DISTINCT FROM (SELECT id FROM people WHERE email = 'dev@example.com');
