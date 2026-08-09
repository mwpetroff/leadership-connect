import { pgTable, serial, integer, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";
import { eventsTable } from "./events";

export const invitationStatusEnum = pgEnum("invitation_status", [
  "invited",
  "attended",
  "no_show",
  "declined",
]);

export const invitationsTable = pgTable(
  "invitations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    status: invitationStatusEnum("status").notNull().default("invited"),
    notes: text("notes"),
    graphEventId: text("graph_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    // Prevents duplicate invitations for the same person+event pair.
    // Also makes INSERT … ON CONFLICT DO NOTHING safe for concurrent bulk creates.
    eventPersonUnique: unique("invitations_event_id_person_id_unique").on(table.eventId, table.personId),
  }),
);

export const insertInvitationSchema = createInsertSchema(invitationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitationsTable.$inferSelect;
