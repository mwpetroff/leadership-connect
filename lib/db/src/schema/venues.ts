import { pgTable, text, serial, timestamp, doublePrecision } from "drizzle-orm/pg-core";

export const venuesTable = pgTable("venues", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  address:     text("address").notNull(),
  city:        text("city").notNull(),
  state:       text("state").notNull(),
  zipCode:     text("zip_code"),
  webLink:     text("web_link"),
  lat:         doublePrecision("lat"),
  lng:         doublePrecision("lng"),
  geocodedAt:  timestamp("geocoded_at", { withTimezone: true }),
  notes:       text("notes"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Venue         = typeof venuesTable.$inferSelect;
export type InsertVenue   = typeof venuesTable.$inferInsert;
