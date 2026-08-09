import { Router, type IRouter } from "express";
import { eq, gte, and } from "drizzle-orm";
import {
  db,
  eventsTable,
  eventLeadersTable,
  peopleTable,
  invitationsTable,
} from "@workspace/db";
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

const router: IRouter = Router();

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

  const [event] = await db.insert(eventsTable).values(parsed.data).returning();
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

  const [event] = await db
    .update(eventsTable)
    .set(parsed.data)
    .where(eq(eventsTable.id, params.data.id))
    .returning();

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

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

  res.sendStatus(204);
});

export default router;
