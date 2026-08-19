import { pgTable, text, serial, integer, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * HR-maintained org units. A row with no parent is a division (e.g. "AI & Digital Solutions");
 * children are departments (e.g. "Modern Apps"). People are assigned to a department, not a
 * free-text string. Cadences for leadership and skip-level 1:1s live on the department;
 * null means "use the organisation default".
 */
export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id").references((): AnyPgColumn => departmentsTable.id, {
    onDelete: "set null",
  }),
  leadershipOneOnOneDays: integer("leadership_one_on_one_days"),
  skipLevelDays: integer("skip_level_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;
