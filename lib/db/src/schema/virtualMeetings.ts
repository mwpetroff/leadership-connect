import { pgTable, serial, integer, text, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "suggested",
  "scheduled",
  "completed",
  "cancelled",
]);

export const virtualMeetingsTable = pgTable("virtual_meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }),
  status: meetingStatusEnum("status").notNull().default("suggested"),
  notes: text("notes"),
  hostId: integer("host_id").references(() => peopleTable.id, { onDelete: "set null" }),
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
