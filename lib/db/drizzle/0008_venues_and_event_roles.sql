-- Create venues table
CREATE TABLE IF NOT EXISTS "venues" (
  "id"           serial PRIMARY KEY,
  "name"         text NOT NULL,
  "address"      text NOT NULL,
  "city"         text NOT NULL,
  "state"        text NOT NULL,
  "zip_code"     text,
  "web_link"     text,
  "lat"          double precision,
  "lng"          double precision,
  "geocoded_at"  timestamp with time zone,
  "notes"        text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sponsor_id"       integer;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organizer_id"     integer;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue_id"         integer;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "evening_venue_id" integer;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_sponsor_id_people_id_fk"
  FOREIGN KEY ("sponsor_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_people_id_fk"
  FOREIGN KEY ("organizer_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk"
  FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_evening_venue_id_venues_id_fk"
  FOREIGN KEY ("evening_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;
