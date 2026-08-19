import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "suggested",
  "scheduled",
  "completed",
  "cancelled",
]);

/** Classifies a virtual meeting for coverage clocks. `general` is the legacy default. */
export const meetingKindEnum = pgEnum("meeting_kind", [
  "general",
  "hrbp_1on1",
  "leader_1on1",
  "skip_level",
]);

export const virtualMeetingsTable = pgTable("virtual_meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true, mode: "date" }),
  status: meetingStatusEnum("status").notNull().default("suggested"),
  meetingKind: meetingKindEnum("meeting_kind").notNull().default("general"),
  notes: text("notes"),
  hostId: integer("host_id").references(() => peopleTable.id, { onDelete: "set null" }),
  teamsJoinUrl: text("teams_join_url"),
  graphMeetingId: text("graph_meeting_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVirtualMeetingSchema = createInsertSchema(virtualMeetingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVirtualMeeting = z.infer<typeof insertVirtualMeetingSchema>;
export type VirtualMeeting = typeof virtualMeetingsTable.$inferSelect;
