import { pgTable, text, serial, integer, timestamp, pgEnum, doublePrecision, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["executive", "secondary_leader", "staff"]);

export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  title: text("title"),
  department: text("department"),
  role: roleEnum("role").notNull().default("staff"),
  homeCity: text("home_city").notNull(),
  homeState: text("home_state").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
  managerId: integer("manager_id").references((): AnyPgColumn => peopleTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
