-- Enable pg_trgm for GIN-accelerated ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- GIN trigram indexes on people columns
CREATE INDEX IF NOT EXISTS "people_name_trgm_idx" ON "people" USING GIN ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_email_trgm_idx" ON "people" USING GIN ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_department_trgm_idx" ON "people" USING GIN ("department" gin_trgm_ops);--> statement-breakpoint

-- GIN trigram indexes on events columns
CREATE INDEX IF NOT EXISTS "events_name_trgm_idx" ON "events" USING GIN ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_location_trgm_idx" ON "events" USING GIN ("location" gin_trgm_ops);--> statement-breakpoint

-- GIN trigram indexes on virtual_meetings columns
CREATE INDEX IF NOT EXISTS "virtual_meetings_title_trgm_idx" ON "virtual_meetings" USING GIN ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "virtual_meetings_notes_trgm_idx" ON "virtual_meetings" USING GIN ("notes" gin_trgm_ops);
