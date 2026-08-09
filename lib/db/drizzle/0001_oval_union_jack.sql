-- Add UNIQUE(event_id, person_id) constraint to invitations table.
--
-- Before adding the constraint, remove any pre-existing duplicate invitation
-- rows so the ALTER TABLE does not fail on legacy data.
-- Policy: keep the oldest invitation (lowest id) for each (event_id, person_id)
-- pair and delete later duplicates.
DELETE FROM "invitations"
WHERE "id" NOT IN (
  SELECT MIN("id") FROM "invitations"
  GROUP BY "event_id", "person_id"
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_person_id_unique" UNIQUE("event_id","person_id");
