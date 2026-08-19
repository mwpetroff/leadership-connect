import { Router, type IRouter } from "express";
import { eq, gte, and, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  eventsTable,
  eventLeadersTable,
  eventSponsorsTable,
  peopleTable,
  invitationsTable,
  virtualMeetingParticipantsTable,
  virtualMeetingsTable,
  venuesTable,
} from "@workspace/db";
import { geocodeCity } from "../lib/geocoding";
import { haversineMiles } from "../lib/geo";
import { getSetting } from "../lib/settings-store";
import {
  ListEventsQueryParams,
  CreateEventBody,
  GetEventParams,
  UpdateEventParams,
  UpdateEventBody,
  DeleteEventParams,
  ListEventLeadersParams,
  AddEventLeaderParams,
  RemoveEventLeaderParams,
  AddEventSponsorParams,
  AddEventSponsorBody,
  RemoveEventSponsorParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { eventTouchesScope } from "../lib/scope";
import { resolveRequestFocus } from "../lib/scope-request";

const router: IRouter = Router();

/** Convert a Zod-coerced Date (or already-string) to 'YYYY-MM-DD' for Drizzle date columns. */
const toDateStr = (d: Date | string): string =>
  d instanceof Date ? d.toISOString().split("T")[0] : d;

async function eventWithCounts(event: typeof eventsTable.$inferSelect) {
  // Fetch all counts + related rows in parallel
  const [leaders, invitations, sponsorRows, organizerRow, venueRow, eveningVenueRow] = await Promise.all([
    db.select().from(eventLeadersTable).where(eq(eventLeadersTable.eventId, event.id)),
    db.select().from(invitationsTable).where(eq(invitationsTable.eventId, event.id)),
    // sponsors: join through junction table
    db
      .select({ id: peopleTable.id, name: peopleTable.name, title: peopleTable.title, role: peopleTable.role })
      .from(eventSponsorsTable)
      .innerJoin(peopleTable, eq(peopleTable.id, eventSponsorsTable.personId))
      .where(eq(eventSponsorsTable.eventId, event.id))
      .orderBy(eventSponsorsTable.addedAt),
    event.organizerId
      ? db.select().from(peopleTable).where(eq(peopleTable.id, event.organizerId)).then(r => r[0] ?? null)
      : null,
    event.venueId
      ? db.select().from(venuesTable).where(eq(venuesTable.id, event.venueId)).then(r => r[0] ?? null)
      : null,
    event.eveningVenueId
      ? db.select().from(venuesTable).where(eq(venuesTable.id, event.eveningVenueId)).then(r => r[0] ?? null)
      : null,
  ]);

  const pickPerson = (p: typeof peopleTable.$inferSelect | null) =>
    p ? { id: p.id, name: p.name, title: p.title, role: p.role } : null;

  const pickVenue = (v: typeof venuesTable.$inferSelect | null) =>
    v ? { id: v.id, name: v.name, address: v.address, city: v.city, state: v.state, zipCode: v.zipCode, webLink: v.webLink, notes: v.notes } : null;

  const touchPersonIds = [
    ...leaders.map((l) => l.personId),
    ...invitations.map((i) => i.personId),
    organizerRow?.id,
    ...sponsorRows.map((s) => s.id),
  ].filter((id): id is number => typeof id === "number");

  return {
    ...event,
    sponsors:     sponsorRows,
    organizer:    pickPerson(organizerRow),
    venue:        pickVenue(venueRow),
    eveningVenue: pickVenue(eveningVenueRow),
    leaderCount:  leaders.length,
    inviteeCount: invitations.length,
    attendeeCount: invitations.filter((i) => i.status === "attended").length,
    touchPersonIds,
  };
}

function publicEvent<T extends { touchPersonIds?: number[] }>(event: T) {
  const { touchPersonIds: _ids, ...rest } = event;
  return rest;
}

router.get("/events", async (req, res): Promise<void> => {
  const parsed = ListEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const conditions = [];

  if (parsed.data.upcoming === true) {
    conditions.push(gte(eventsTable.startDate, today));
  }
  if (parsed.data.type) {
    conditions.push(eq(eventsTable.eventType, parsed.data.type as any));
  }

  const events =
    conditions.length > 0
      ? await db.select().from(eventsTable).where(and(...conditions)).orderBy(eventsTable.startDate)
      : await db.select().from(eventsTable).orderBy(eventsTable.startDate);

  const enriched = await Promise.all(events.map(eventWithCounts));
  if (enriched.length === 0) {
    res.json([]);
    return;
  }

  const { scope, focus } = await resolveRequestFocus(req);
  const visible =
    scope.lens === "all"
      ? enriched
      : enriched.filter((event) => eventTouchesScope(event.touchPersonIds, focus));
  res.json(visible.map(publicEvent));
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // When a venueId is provided, derive location / city / state / coords from venue
  let location = parsed.data.location ?? "";
  let city     = parsed.data.city     ?? "";
  let state    = parsed.data.state    ?? "";
  let lat: number | null = null;
  let lng: number | null = null;

  if (parsed.data.venueId) {
    const [v] = await db.select().from(venuesTable).where(eq(venuesTable.id, parsed.data.venueId));
    if (v) {
      location = v.name;
      city     = v.city;
      state    = v.state;
      lat      = v.lat ?? null;
      lng      = v.lng ?? null;
    }
  }

  if (!location) location = city || "TBD";

  // Geocode only if no venue coords
  if ((lat === null || lng === null) && city && state) {
    const coords = await geocodeCity(city, state);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const { location: _l, city: _c, state: _s, sponsorIds, ...rest } = parsed.data;
  const [event] = await db
    .insert(eventsTable)
    .values({
      ...rest,
      location,
      city,
      state,
      startDate: toDateStr(parsed.data.startDate),
      endDate: parsed.data.endDate ? toDateStr(parsed.data.endDate) : undefined,
      lat,
      lng,
      geocodedAt: new Date(),
    })
    .returning();

  // Bulk-insert sponsors into junction table
  if (sponsorIds && sponsorIds.length > 0) {
    await db.insert(eventSponsorsTable).values(
      sponsorIds.map((personId) => ({ eventId: event.id, personId }))
    ).onConflictDoNothing();
  }

  logAudit(req, "create", "event", event.id, null, event);
  res.status(201).json(publicEvent(await eventWithCounts(event)));
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.json(publicEvent(await eventWithCounts(event)));
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id));

  const { startDate, endDate, ...restData } = parsed.data;
  const setData: Record<string, unknown> = {
    ...restData,
    ...(startDate !== undefined ? { startDate: toDateStr(startDate) } : {}),
    ...(endDate !== undefined ? { endDate: endDate ? toDateStr(endDate) : undefined } : {}),
  };

  // If venueId changed, derive location/city/state/coords from new venue
  if (parsed.data.venueId !== undefined) {
    if (parsed.data.venueId) {
      const [v] = await db.select().from(venuesTable).where(eq(venuesTable.id, parsed.data.venueId));
      if (v) {
        setData.location    = v.name;
        setData.city        = v.city;
        setData.state       = v.state;
        setData.lat         = v.lat ?? null;
        setData.lng         = v.lng ?? null;
        setData.geocodedAt  = new Date();
      }
    }
  } else {
    // Re-geocode only when city or state actually changes
    const cityChanged  = parsed.data.city  !== undefined && parsed.data.city  !== before?.city;
    const stateChanged = parsed.data.state !== undefined && parsed.data.state !== before?.state;
    if (cityChanged || stateChanged) {
      const city  = (parsed.data.city  ?? before?.city)  as string | undefined;
      const state = (parsed.data.state ?? before?.state) as string | undefined;
      const coords = await geocodeCity(city, state);
      setData.lat = coords?.lat ?? null;
      setData.lng = coords?.lng ?? null;
      setData.geocodedAt = new Date();
    }
  }

  const [event] = await db
    .update(eventsTable)
    .set(setData)
    .where(eq(eventsTable.id, params.data.id))
    .returning();

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  logAudit(req, "update", "event", event.id, before ?? null, event);
  res.json(publicEvent(await eventWithCounts(event)));
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [event] = await db.delete(eventsTable).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  logAudit(req, "delete", "event", event.id, event, null);
  res.sendStatus(204);
});

// ── Event sponsors ──────────────────────────────────────────────────────────────

router.get("/events/:eventId/sponsors", async (req, res): Promise<void> => {
  const params = AddEventSponsorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const rows = await db
    .select({ id: peopleTable.id, name: peopleTable.name, title: peopleTable.title, role: peopleTable.role })
    .from(eventSponsorsTable)
    .innerJoin(peopleTable, eq(peopleTable.id, eventSponsorsTable.personId))
    .where(eq(eventSponsorsTable.eventId, params.data.eventId))
    .orderBy(eventSponsorsTable.addedAt);
  res.json(rows);
});

router.post("/events/:eventId/sponsors", async (req, res): Promise<void> => {
  const params = AddEventSponsorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = AddEventSponsorBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, params.data.eventId));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  await db.insert(eventSponsorsTable).values({ eventId: params.data.eventId, personId: body.data.personId }).onConflictDoNothing();
  logAudit(req, "create", "event_sponsor", params.data.eventId, null, { personId: body.data.personId });
  res.status(201).json({ eventId: params.data.eventId, personId: body.data.personId });
});

router.delete("/events/:eventId/sponsors/:personId", async (req, res): Promise<void> => {
  const params = RemoveEventSponsorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db
    .delete(eventSponsorsTable)
    .where(and(eq(eventSponsorsTable.eventId, params.data.eventId), eq(eventSponsorsTable.personId, params.data.personId)));
  logAudit(req, "delete", "event_sponsor", params.data.eventId, { personId: params.data.personId }, null);
  res.sendStatus(204);
});

// Briefing
router.get("/events/:id/briefing", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const eventId = params.data.id;

  const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Single query: all invitees with their person record
  const invitees = await db
    .select({
      personId: invitationsTable.personId,
      invitationStatus: invitationsTable.status,
      person: peopleTable,
    })
    .from(invitationsTable)
    .innerJoin(peopleTable, eq(invitationsTable.personId, peopleTable.id))
    .where(eq(invitationsTable.eventId, eventId));

  if (invitees.length === 0) {
    res.json({ attendees: [], keyPeople: [] });
    return;
  }

  const personIds = invitees.map((i) => i.personId);

  // Batch query: last attended in-person event per person
  const attendedRows = await db
    .select({
      personId: invitationsTable.personId,
      eventDate: eventsTable.startDate,
    })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(
      and(
        inArray(invitationsTable.personId, personIds),
        eq(invitationsTable.status, "attended")
      )
    );

  // Batch query: last completed virtual meeting per person
  const virtualRows = await db
    .select({
      personId: virtualMeetingParticipantsTable.personId,
      meetingDate: virtualMeetingsTable.scheduledDate,
    })
    .from(virtualMeetingParticipantsTable)
    .innerJoin(
      virtualMeetingsTable,
      and(
        eq(virtualMeetingParticipantsTable.meetingId, virtualMeetingsTable.id),
        eq(virtualMeetingsTable.status, "completed")
      )
    )
    .where(inArray(virtualMeetingParticipantsTable.personId, personIds));

  // Build per-person: latest touchpoint timestamp and total count
  const lastTouchpointMs = new Map<number, number>();
  const touchpointCount = new Map<number, number>();

  for (const row of attendedRows) {
    const ms = new Date(row.eventDate).getTime();
    if (!isNaN(ms)) {
      const prev = lastTouchpointMs.get(row.personId) ?? 0;
      if (ms > prev) lastTouchpointMs.set(row.personId, ms);
      touchpointCount.set(row.personId, (touchpointCount.get(row.personId) ?? 0) + 1);
    }
  }

  for (const row of virtualRows) {
    if (row.meetingDate) {
      const ms = new Date(row.meetingDate).getTime();
      if (!isNaN(ms)) {
        const prev = lastTouchpointMs.get(row.personId) ?? 0;
        if (ms > prev) lastTouchpointMs.set(row.personId, ms);
        touchpointCount.set(row.personId, (touchpointCount.get(row.personId) ?? 0) + 1);
      }
    }
  }

  const now = Date.now();

  const attendees = invitees.map((inv) => {
    const lastMs = lastTouchpointMs.get(inv.personId);
    const daysSinceLastTouchpoint =
      lastMs != null ? Math.floor((now - lastMs) / (1000 * 60 * 60 * 24)) : null;
    return {
      person: inv.person,
      invitationStatus: inv.invitationStatus,
      daysSinceLastTouchpoint,
      totalTouchpoints: touchpointCount.get(inv.personId) ?? 0,
    };
  });

  // Sort: never-met first (null), then longest gap descending
  attendees.sort((a, b) => {
    if (a.daysSinceLastTouchpoint === null && b.daysSinceLastTouchpoint === null) return 0;
    if (a.daysSinceLastTouchpoint === null) return -1;
    if (b.daysSinceLastTouchpoint === null) return 1;
    return b.daysSinceLastTouchpoint - a.daysSinceLastTouchpoint;
  });

  res.json({ attendees, keyPeople: attendees.slice(0, 3) });
});

// Leaders
router.get("/events/:id/leaders", async (req, res): Promise<void> => {
  const params = ListEventLeadersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const leaders = await db
    .select({ person: peopleTable })
    .from(eventLeadersTable)
    .innerJoin(peopleTable, eq(eventLeadersTable.personId, peopleTable.id))
    .where(eq(eventLeadersTable.eventId, params.data.id));

  res.json(leaders.map((l) => l.person));
});

router.post("/events/:eventId/leaders/:personId", async (req, res): Promise<void> => {
  const params = AddEventLeaderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(eventLeadersTable)
    .where(
      and(
        eq(eventLeadersTable.eventId, params.data.eventId),
        eq(eventLeadersTable.personId, params.data.personId)
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: "Leader already added to this event" });
    return;
  }

  const [row] = await db
    .insert(eventLeadersTable)
    .values({ eventId: params.data.eventId, personId: params.data.personId })
    .returning();

  logAudit(
    req, "create", "event_leader",
    `${params.data.eventId}:${params.data.personId}`,
    null, row ?? null,
  );
  res.status(201).json(row);
});

router.delete("/events/:eventId/leaders/:personId", async (req, res): Promise<void> => {
  const params = RemoveEventLeaderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .delete(eventLeadersTable)
    .where(
      and(
        eq(eventLeadersTable.eventId, params.data.eventId),
        eq(eventLeadersTable.personId, params.data.personId)
      )
    )
    .returning();

  if (!row) {
    res.status(404).json({ error: "Leader not found for this event" });
    return;
  }

  logAudit(
    req, "delete", "event_leader",
    `${params.data.eventId}:${params.data.personId}`,
    row, null,
  );
  res.sendStatus(204);
});

// ── GET /events/:id/nearby-uninvited ──────────────────────────────────────────
// Returns people within invite_radius_miles of the event who haven't been invited.

router.get("/events/:id/nearby-uninvited", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid event id" });
    return;
  }

  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const radiusMiles = parseInt(
    ((req.query.radiusMiles as string | undefined) ?? await getSetting("invite_radius_miles")) || "50",
    10,
  );

  // Try stored coords first; fall back to live geocode
  let eventLat = event.lat;
  let eventLng = event.lng;
  if (eventLat == null || eventLng == null) {
    const coords = await geocodeCity(event.city, event.state);
    if (coords) { eventLat = coords.lat; eventLng = coords.lng; }
  }

  if (eventLat == null || eventLng == null) {
    res.json({ people: [], radiusMiles, message: "Event location could not be geocoded" });
    return;
  }

  // Existing invitees for this event
  const existing = await db
    .select({ personId: invitationsTable.personId })
    .from(invitationsTable)
    .where(eq(invitationsTable.eventId, id));
  const invitedIds = new Set(existing.map((r) => r.personId));

  // All people with coordinates
  const allPeople = await db
    .select()
    .from(peopleTable)
    .where(isNotNull(peopleTable.lat));

  const eLat = eventLat;
  const eLng = eventLng;

  const nearby = allPeople
    .filter((p) => {
      if (invitedIds.has(p.id)) return false;
      if (p.lat == null || p.lng == null) return false;
      return haversineMiles(eLat, eLng, p.lat, p.lng) <= radiusMiles;
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      role: p.role,
      department: null,
      homeCity: p.homeCity,
      homeState: p.homeState,
      distanceMiles: Math.round(haversineMiles(eLat, eLng, p.lat!, p.lng!) * 10) / 10,
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  res.json({ people: nearby, radiusMiles, eventLat: eLat, eventLng: eLng });
});

export default router;
