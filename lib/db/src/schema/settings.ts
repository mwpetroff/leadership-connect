import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Key-value configuration store. Keys are human-readable strings;
 * values are always stored as text and cast by the application layer.
 *
 * Default values:
 *   touchpoint_threshold_days = "90"
 *   suggestion_radius          = "state"   (same-city | same-state | nationwide)
 *   org_name                   = "Leadership Connect"
 */
export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Setting = typeof settingsTable.$inferSelect;
