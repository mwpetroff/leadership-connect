import { pgTable, text, serial, integer, timestamp, pgEnum, doublePrecision, boolean, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./departments";

export const roleEnum = pgEnum("role", ["executive", "secondary_leader", "staff"]);
export const employmentStatusEnum = pgEnum("employment_status", ["active", "inactive"]);

export const peopleTable = pgTable(
  "people",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    title: text("title"),
    departmentId: integer("department_id").references(() => departmentsTable.id, {
      onDelete: "set null",
    }),
    role: roleEnum("role").notNull().default("staff"),
    homeCity: text("home_city").notNull(),
    homeState: text("home_state").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
    managerId: integer("manager_id").references((): AnyPgColumn => peopleTable.id, {
      onDelete: "set null",
    }),
    hrbpId: integer("hrbp_id").references((): AnyPgColumn => peopleTable.id, {
      onDelete: "set null",
    }),
    isHrbp: boolean("is_hrbp").notNull().default(false),
    status: employmentStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("people_department_id_idx").on(table.departmentId),
    index("people_hrbp_id_idx").on(table.hrbpId),
    index("people_manager_id_idx").on(table.managerId),
    index("people_status_idx").on(table.status),
    index("people_is_hrbp_idx").on(table.isHrbp),
  ],
);

export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
