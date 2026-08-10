import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, peopleTable, eventsTable, invitationsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /map-data
 *
 * Returns all people (with home locations), all events (with venue locations),
 * and the invitation links between them — enough for the Engagement Map to
 * plot markers and draw leader↔event connection lines in a single request.
 */
router.get("/map-data", async (_req, res): Promise<void> => {
  const [people, events, invitations] = await Promise.all([
    db.select({
      id: peopleTable.id,
      name: peopleTable.name,
      role: peopleTable.role,
      title: peopleTable.title,
      homeCity: peopleTable.homeCity,
      homeState: peopleTable.homeState,
    }).from(peopleTable),

    db.select({
      id: eventsTable.id,
      name: eventsTable.name,
      location: eventsTable.location,
      city: eventsTable.city,
      state: eventsTable.state,
      startDate: eventsTable.startDate,
      endDate: eventsTable.endDate,
      eventType: eventsTable.eventType,
    }).from(eventsTable),

    db.select({
      eventId: invitationsTable.eventId,
      personId: invitationsTable.personId,
      status: invitationsTable.status,
    }).from(invitationsTable),
  ]);

  // Build a personId → person lookup for enriching invitations
  const personById = new Map(people.map((p) => [p.id, p]));

  // Attach enriched invitee lists to each event
  const eventsWithInvitees = events.map((event) => ({
    ...event,
    invitees: invitations
      .filter((inv) => inv.eventId === event.id)
      .map((inv) => {
        const person = personById.get(inv.personId);
        return {
          personId: inv.personId,
          personName: person?.name ?? "Unknown",
          personRole: person?.role ?? "staff",
          personTitle: person?.title ?? null,
          status: inv.status,
        };
      }),
  }));

  res.json({ people, events: eventsWithInvitees });
});

export default router;
