import { Router, type IRouter } from "express";
import { db, peopleTable, eventsTable, invitationsTable, officesTable } from "@workspace/db";
import { parseScopeQuery, effectiveScope, inFocusIds, asScopePerson, eventTouchesScope } from "../lib/scope";
import { resolveViewer } from "../lib/viewer";

const router: IRouter = Router();

/**
 * GET /map-data
 *
 * Returns all people (with home locations), all events (with venue locations),
 * and the invitation links between them — enough for the Engagement Map to
 * plot markers and draw leader↔event connection lines in a single request.
 *
 * lat/lng are included when already geocoded server-side so the client
 * can skip Nominatim for known records.
 */
router.get("/map-data", async (req, res): Promise<void> => {
  const [people, events, invitations, offices] = await Promise.all([
    db.select({
      id: peopleTable.id,
      name: peopleTable.name,
      role: peopleTable.role,
      title: peopleTable.title,
      homeCity: peopleTable.homeCity,
      homeState: peopleTable.homeState,
      lat: peopleTable.lat,
      lng: peopleTable.lng,
      managerId: peopleTable.managerId,
      departmentId: peopleTable.departmentId,
      hrbpId: peopleTable.hrbpId,
      status: peopleTable.status,
    }).from(peopleTable),

    db.select({
      id: eventsTable.id,
      name: eventsTable.name,
      location: eventsTable.location,
      city: eventsTable.city,
      state: eventsTable.state,
      lat: eventsTable.lat,
      lng: eventsTable.lng,
      startDate: eventsTable.startDate,
      endDate: eventsTable.endDate,
      eventType: eventsTable.eventType,
    }).from(eventsTable),

    db.select({
      eventId: invitationsTable.eventId,
      personId: invitationsTable.personId,
      status: invitationsTable.status,
    }).from(invitationsTable),

    db.select({
      id: officesTable.id,
      name: officesTable.name,
      city: officesTable.city,
      state: officesTable.state,
      lat: officesTable.lat,
      lng: officesTable.lng,
    }).from(officesTable),
  ]);

  const viewer = await resolveViewer(req);
  const scope = effectiveScope(parseScopeQuery(req.query as Record<string, unknown>), viewer);
  const focus = inFocusIds(people.map(asScopePerson), scope, viewer);
  const scopedPeople = people.filter((p) => focus.has(p.id));

  // Build a personId → person lookup for enriching invitations
  const personById = new Map(scopedPeople.map((p) => [p.id, p]));

  // Attach enriched invitee lists to each event
  const eventsWithInvitees = events
    .filter((event) => {
      if (scope.lens === "all") return true;
      const participantIds = invitations
        .filter((inv) => inv.eventId === event.id)
        .map((inv) => inv.personId);
      return eventTouchesScope(participantIds, focus);
    })
    .map((event) => ({
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

  res.json({ people: scopedPeople, events: eventsWithInvitees, offices });
});

export default router;
