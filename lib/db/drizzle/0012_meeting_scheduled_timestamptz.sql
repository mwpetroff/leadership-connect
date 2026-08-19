-- Store virtual meeting times as instants. Date-only rows become 10:00 UTC
-- (the previous Teams default) so existing meetings keep the same clock time.

ALTER TABLE virtual_meetings
  ALTER COLUMN scheduled_date TYPE timestamptz
  USING CASE
    WHEN scheduled_date IS NULL THEN NULL
    ELSE (scheduled_date::timestamp AT TIME ZONE 'UTC') + INTERVAL '10 hours'
  END;
