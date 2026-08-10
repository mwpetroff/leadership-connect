import { Router, type IRouter } from "express";
import { ilike, or } from "drizzle-orm";
import { db, peopleTable, eventsTable, virtualMeetingsTable } from "@workspace/db";

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
          department: peopleTable.department,
          role: peopleTable.role,
        })
        .from(peopleTable)
        .where(
          or(
            ilike(peopleTable.name, term),
            ilike(peopleTable.email, term),
            ilike(peopleTable.department, term),
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

    res.json({ people, events, virtualMeetings });
  } catch (err) {
    console.error("[search] error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
