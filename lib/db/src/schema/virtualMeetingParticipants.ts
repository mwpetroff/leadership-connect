import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { peopleTable } from "./people";
import { virtualMeetingsTable } from "./virtualMeetings";

export const virtualMeetingParticipantsTable = pgTable(
  "virtual_meeting_participants",
  {
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => virtualMeetingsTable.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.personId] })],
);

export type VirtualMeetingParticipant = typeof virtualMeetingParticipantsTable.$inferSelect;
