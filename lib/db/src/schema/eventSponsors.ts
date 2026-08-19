import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { peopleTable } from "./people";
import { eventsTable } from "./events";

export const eventSponsorsTable = pgTable(
  "event_sponsors",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => peopleTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.personId] })],
);

export type EventSponsor = typeof eventSponsorsTable.$inferSelect;
