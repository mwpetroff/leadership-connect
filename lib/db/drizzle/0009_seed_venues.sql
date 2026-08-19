-- ── Seed: venues and event role data ─────────────────────────────────────────
-- Inserts real corporate venues and links them to existing events with
-- sponsors, organizers, and evening venues to exercise all new fields.

INSERT INTO venues (name, address, city, state, zip_code, web_link, notes, created_at)
VALUES
  ('Marriott Marquis New York',  '1535 Broadway',                  'New York',       'NY', '10036', 'https://www.marriott.com/en-us/hotels/nycmq-new-york-marriott-marquis', 'Times Square location; underground parking available', now()),
  ('Loews Chicago Hotel',        '455 N Park Dr',                  'Chicago',        'IL', '60611', 'https://www.loewshotels.com/chicago-hotel',                            'Valet parking; AV team on-site', now()),
  ('Westin Galleria Houston',    '5060 W Alabama St',              'Houston',        'TX', '77056', 'https://www.marriott.com/en-us/hotels/houga-the-westin-galleria-houston','Connected to Galleria Mall', now()),
  ('Austin Convention Center',   '500 E Cesar Chavez St',          'Austin',         'TX', '78701', 'https://www.austinconventioncenter.com',                               'Large main hall; separate breakout rooms', now()),
  ('Hotel Zaza Houston',         '5701 Main St',                   'Houston',        'TX', '77005', 'https://www.hotelzazahouston.com',                                     'Great for evening receptions; rooftop terrace', now()),
  ('The Driskill Hotel',         '604 Brazos St',                  'Austin',         'TX', '78701', 'https://www.driskillhotel.com',                                        'Historic venue; ideal for evening dinners', now()),
  ('Hyatt Regency Chicago',      '151 E Wacker Dr',                'Chicago',        'IL', '60601', 'https://www.hyatt.com/en-US/hotel/illinois/hyatt-regency-chicago',     'Steps from Millennium Park', now()),
  ('Hotel Van Zandt Austin',     '605 Davis St',                   'Austin',         'TX', '78701', 'https://www.hotelvanzandt.com',                                        'Music venue and hotel; rooftop pool', now()),
  ('Omni Dallas Hotel',          '555 S Lamar St',                 'Dallas',         'TX', '75202', 'https://www.omnihotels.com/hotels/dallas',                             'Connected to convention center via skybridge', now()),
  ('The Roosevelt New Orleans',  '130 Roosevelt Way',              'New Orleans',    'LA', '70112', 'https://www.therooseveltneworleans.com',                               'Historic; Sazerac Bar on premises', now()),
  ('Westin Copley Place',        '10 Huntington Ave',              'Boston',         'MA', '02116', 'https://www.marriott.com/en-us/hotels/bosco-the-westin-copley-place',  'Connected to Copley Place Mall', now()),
  ('Corporate HQ — Austin',      '11501 Domain Blvd Suite 200',    'Austin',         'TX', '78758', NULL, 'Main Austin office; Conf Room A seats 40', now()),
  ('Corporate HQ — New York',    '1 World Trade Center Fl 85',     'New York',       'NY', '10007', NULL, 'NYC HQ; panoramic views; fits 80 for all-hands', now()),
  ('Corporate HQ — Chicago',     '321 N Clark St Suite 1200',      'Chicago',        'IL', '60654', NULL, 'Chicago satellite office; boardroom seats 20', now())
ON CONFLICT DO NOTHING;

-- Link the Annual Leadership Summit (assume id=1 for Annual Leadership Summit at Marriott Marquis New York)
-- We'll update by name to be safe
UPDATE events
SET
  venue_id       = (SELECT id FROM venues WHERE name = 'Marriott Marquis New York'  LIMIT 1),
  evening_venue_id = NULL,
  sponsor_id     = (SELECT id FROM people WHERE role = 'executive' ORDER BY id LIMIT 1),
  organizer_id   = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id LIMIT 1)
WHERE name ILIKE '%annual leadership summit%';

UPDATE events
SET
  venue_id       = (SELECT id FROM venues WHERE name = 'Loews Chicago Hotel'    LIMIT 1),
  evening_venue_id = (SELECT id FROM venues WHERE name = 'Hyatt Regency Chicago' LIMIT 1),
  sponsor_id     = (SELECT id FROM people WHERE role = 'executive' ORDER BY id OFFSET 1 LIMIT 1),
  organizer_id   = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id OFFSET 1 LIMIT 1)
WHERE name ILIKE '%hr%people operations%' OR name ILIKE '%chicago%';

UPDATE events
SET
  venue_id     = (SELECT id FROM venues WHERE name = 'Hotel Van Zandt Austin'   LIMIT 1),
  evening_venue_id = (SELECT id FROM venues WHERE name = 'The Driskill Hotel'   LIMIT 1),
  sponsor_id   = (SELECT id FROM people WHERE role = 'executive' ORDER BY id OFFSET 2 LIMIT 1),
  organizer_id = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id OFFSET 2 LIMIT 1)
WHERE name ILIKE '%engineering%' OR (city ILIKE 'austin' AND name NOT ILIKE '%texas%');

UPDATE events
SET
  venue_id     = (SELECT id FROM venues WHERE name = 'Austin Convention Center' LIMIT 1),
  evening_venue_id = (SELECT id FROM venues WHERE name = 'Hotel Zaza Houston'   LIMIT 1),
  sponsor_id   = (SELECT id FROM people WHERE role = 'executive' ORDER BY id LIMIT 1),
  organizer_id = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id LIMIT 1)
WHERE name ILIKE '%texas all-hands%' OR (city ILIKE 'austin' AND name ILIKE '%texas%');

UPDATE events
SET
  venue_id     = (SELECT id FROM venues WHERE name = 'Westin Galleria Houston' LIMIT 1),
  sponsor_id   = (SELECT id FROM people WHERE role = 'executive' ORDER BY id OFFSET 1 LIMIT 1),
  organizer_id = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id LIMIT 1)
WHERE city ILIKE 'houston';

UPDATE events
SET
  venue_id     = (SELECT id FROM venues WHERE name = 'Hyatt Regency Chicago'   LIMIT 1),
  evening_venue_id = (SELECT id FROM venues WHERE name = 'Corporate HQ — Chicago' LIMIT 1),
  sponsor_id   = (SELECT id FROM people WHERE role = 'executive' ORDER BY id OFFSET 2 LIMIT 1),
  organizer_id = (SELECT id FROM people WHERE role = 'secondary_leader' ORDER BY id OFFSET 2 LIMIT 1)
WHERE name ILIKE '%q3 marketing%';

-- Update event location/city/state from assigned venue (keep them in sync)
UPDATE events e
SET
  location = v.name,
  city     = v.city,
  state    = v.state
FROM venues v
WHERE e.venue_id = v.id
  AND (e.location != v.name OR e.city != v.city OR e.state != v.state);
