import { Router, type IRouter } from "express";
import { ilike, or } from "drizzle-orm";
import { db, peopleTable, eventsTable, virtualMeetingsTable, virtualMeetingParticipantsTable } from "@workspace/db";
import { resolveRequestFocus } from "../lib/scope-request";

const router: IRouter = Router();

/** GET /search?q=<term>
 * Returns up to 5 results per category: people, events, virtualMeetings.
 * Searches using ILIKE (accelerated by GIN trigram indexes when pg_trgm is enabled).
 */
router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!q) {
    res.json({ people: [], events: [], virtualMeetings: [] });
    return;
  }

  const term = `%${q}%`;

  try {
    const [people, events, virtualMeetings] = await Promise.all([
      db
        .select({
          id: peopleTable.id,
          name: peopleTable.name,
          email: peopleTable.email,
          title: peopleTable.title,
          role: peopleTable.role,
        })
        .from(peopleTable)
        .where(
          or(
            ilike(peopleTable.name, term),
            ilike(peopleTable.email, term),
            ilike(peopleTable.title, term),
          ),
        )
        .limit(5),

      db
        .select({
          id: eventsTable.id,
          name: eventsTable.name,
          location: eventsTable.location,
          startDate: eventsTable.startDate,
          eventType: eventsTable.eventType,
        })
        .from(eventsTable)
        .where(
          or(
            ilike(eventsTable.name, term),
            ilike(eventsTable.location, term),
          ),
        )
        .limit(5),

      db
        .select({
          id: virtualMeetingsTable.id,
          title: virtualMeetingsTable.title,
          status: virtualMeetingsTable.status,
          scheduledDate: virtualMeetingsTable.scheduledDate,
          notes: virtualMeetingsTable.notes,
        })
        .from(virtualMeetingsTable)
        .where(
          or(
            ilike(virtualMeetingsTable.title, term),
            ilike(virtualMeetingsTable.notes, term),
          ),
        )
        .limit(5),
    ]);

    const { scope, focus } = await resolveRequestFocus(req);
    const scopedPeople =
      scope.lens === "all" ? people : people.filter((p) => focus.has(p.id));

    let scopedMeetings = virtualMeetings;
    if (scope.lens !== "all" && virtualMeetings.length > 0) {
      const parts = await db
        .select({
          meetingId: virtualMeetingParticipantsTable.meetingId,
          personId: virtualMeetingParticipantsTable.personId,
        })
        .from(virtualMeetingParticipantsTable);
      const byMeeting = new Map<number, number[]>();
      for (const part of parts) {
        const list = byMeeting.get(part.meetingId) ?? [];
        list.push(part.personId);
        byMeeting.set(part.meetingId, list);
      }
      scopedMeetings = virtualMeetings.filter((m) =>
        (byMeeting.get(m.id) ?? []).some((id) => focus.has(id)),
      );
    }

    res.json({ people: scopedPeople, events, virtualMeetings: scopedMeetings });
  } catch (err) {
    console.error("[search] error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
