import { pgTable, serial, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
]);

/**
 * Immutable append-only log of all create/update/delete actions.
 * The `before` and `after` columns store the full row snapshot as JSON
 * so admins can diff any change.
 */
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  action: auditActionEnum("action").notNull(),
  resourceType: text("resource_type").notNull(), // person | event | invitation | virtual_meeting | setting
  resourceId: text("resource_id").notNull(),
  before: jsonb("before"),                       // null for create
  after: jsonb("after"),                         // null for delete
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
