import { Router, type IRouter } from "express";
import { eq, gte, and } from "drizzle-orm";
import {
  db,
  eventsTable,
  eventLeadersTable,
  peopleTable,
  invitationsTable,
} from "@workspace/db";
import { geocodeCity } from "../lib/geocoding";
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
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

/** Convert a Zod-coerced Date (or already-string) to 'YYYY-MM-DD' for Drizzle date columns. */
const toDateStr = (d: Date | string): string =>
  d instanceof Date ? d.toISOString().split("T")[0] : d;

async function eventWithCounts(event: typeof eventsTable.$inferSelect) {
  const leaders = await db
    .select()
    .from(eventLeadersTable)
    .where(eq(eventLeadersTable.eventId, event.id));

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.eventId, event.id));

  return {
    ...event,
    leaderCount: leaders.length,
    inviteeCount: invitations.length,
    attendeeCount: invitations.filter((i) => i.status === "attended").length,
  };
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
  res.json(enriched);
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const coords = await geocodeCity(parsed.data.city, parsed.data.state);
  const [event] = await db
    .insert(eventsTable)
    .values({
      ...parsed.data,
      startDate: toDateStr(parsed.data.startDate),
      endDate: parsed.data.endDate ? toDateStr(parsed.data.endDate) : undefined,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      geocodedAt: new Date(),
    })
    .returning();
  logAudit(req, "create", "event", event.id, null, event);
  res.status(201).json(await eventWithCounts(event));
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

  res.json(await eventWithCounts(event));
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

  // Re-geocode only when city or state actually changes
  const cityChanged = parsed.data.city !== undefined && parsed.data.city !== before?.city;
  const stateChanged = parsed.data.state !== undefined && parsed.data.state !== before?.state;

  if (cityChanged || stateChanged) {
    const city = (parsed.data.city ?? before?.city) as string | undefined;
    const state = (parsed.data.state ?? before?.state) as string | undefined;
    const coords = await geocodeCity(city, state);
    setData.lat = coords?.lat ?? null;
    setData.lng = coords?.lng ?? null;
    setData.geocodedAt = new Date();
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
  res.json(await eventWithCounts(event));
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

export default router;
