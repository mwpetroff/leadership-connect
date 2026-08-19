import { pgTable, text, serial, timestamp, date, pgEnum, doublePrecision, index, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { peopleTable } from "./people";

export const eventTypeEnum = pgEnum("event_type", [
  "summit",
  "conference",
  "marketing",
  "leadership",
  "regional",
  "other",
]);

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  eventType: eventTypeEnum("event_type").notNull().default("other"),
  // Role fields — sponsorship is now in the event_sponsors junction table (multi-sponsor)
  organizerId: integer("organizer_id").references((): AnyPgColumn => peopleTable.id, { onDelete: "set null" }),
  // Venue fields
  venueId: integer("venue_id").references((): AnyPgColumn => venuesTable.id, { onDelete: "set null" }),
  eveningVenueId: integer("evening_venue_id").references((): AnyPgColumn => venuesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
