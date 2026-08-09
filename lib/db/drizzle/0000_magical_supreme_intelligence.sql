-- Baseline migration for Leadership Connect.
-- Idempotent: safe to run against a fresh database OR against an existing
-- database that was previously managed with drizzle-kit push.
-- All CREATE TYPE / CREATE TABLE statements use IF NOT EXISTS guards;
-- columns that may already exist use ADD COLUMN IF NOT EXISTS.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."role" AS ENUM('executive', 'secondary_leader', 'staff');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_type" AS ENUM('summit', 'conference', 'marketing', 'leadership', 'regional', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."invitation_status" AS ENUM('invited', 'attended', 'no_show', 'declined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."meeting_status" AS ENUM('suggested', 'scheduled', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ── Base tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "people" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "title" text,
  "department" text,
  "role" "role" DEFAULT 'staff' NOT NULL,
  "home_city" text NOT NULL,
  "home_state" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "people_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "location" text NOT NULL,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "event_type" "event_type" DEFAULT 'other' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_leaders" (
  "event_id" integer NOT NULL,
  "person_id" integer NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_leaders_event_id_person_id_pk" PRIMARY KEY("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" integer NOT NULL,
  "person_id" integer NOT NULL,
  "status" "invitation_status" DEFAULT 'invited' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "virtual_meetings" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "scheduled_date" date,
  "status" "meeting_status" DEFAULT 'suggested' NOT NULL,
  "notes" text,
  "host_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "virtual_meeting_participants" (
  "meeting_id" integer NOT NULL,
  "person_id" integer NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "virtual_meeting_participants_meeting_id_person_id_pk" PRIMARY KEY("meeting_id","person_id")
);
--> statement-breakpoint

-- ── Graph integration columns (idempotent — safe if columns already exist) ────
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "graph_event_id" text;
--> statement-breakpoint
ALTER TABLE "virtual_meetings" ADD COLUMN IF NOT EXISTS "teams_join_url" text;
--> statement-breakpoint
ALTER TABLE "virtual_meetings" ADD COLUMN IF NOT EXISTS "graph_meeting_id" text;
--> statement-breakpoint

-- ── MSAL token cache ──────────────────────────────────────────────────────────
-- Stores the encrypted, serialized MSAL token cache across restarts.
-- version enables optimistic concurrency control for multi-replica deployments.
CREATE TABLE IF NOT EXISTS "msal_token_cache" (
  "id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
  "cache_data" text NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── Foreign key constraints (safe to fail if already present) ─────────────────
DO $$ BEGIN
  ALTER TABLE "event_leaders" ADD CONSTRAINT "event_leaders_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_leaders" ADD CONSTRAINT "event_leaders_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "virtual_meetings" ADD CONSTRAINT "virtual_meetings_host_id_people_id_fk"
    FOREIGN KEY ("host_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "virtual_meeting_participants" ADD CONSTRAINT "virtual_meeting_participants_meeting_id_virtual_meetings_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "public"."virtual_meetings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "virtual_meeting_participants" ADD CONSTRAINT "virtual_meeting_participants_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
