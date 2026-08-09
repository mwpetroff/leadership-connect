import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc } from "drizzle-orm";
import { db, peopleTable, invitationsTable, virtualMeetingParticipantsTable, virtualMeetingsTable, eventsTable } from "@workspace/db";
import {
  ListPeopleQueryParams,
  CreatePersonBody,
  GetPersonParams,
  UpdatePersonParams,
  UpdatePersonBody,
  DeletePersonParams,
  GetPersonEngagementParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/people", async (req, res): Promise<void> => {
  const parsed = ListPeopleQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, search } = parsed.data;

  const conditions: ReturnType<typeof eq>[] = [];
  if (role) conditions.push(eq(peopleTable.role, role));

  let query = db.select().from(peopleTable);
  let results;

  if (search) {
    const searchLike = `%${search}%`;
    if (conditions.length > 0) {
      results = await query
        .where(and(...conditions, or(ilike(peopleTable.name, searchLike), ilike(peopleTable.email, searchLike), ilike(peopleTable.department, searchLike))))
        .orderBy(peopleTable.name);
    } else {
      results = await query
        .where(or(ilike(peopleTable.name, searchLike), ilike(peopleTable.email, searchLike), ilike(peopleTable.department, searchLike)))
        .orderBy(peopleTable.name);
    }
  } else if (conditions.length > 0) {
    results = await query.where(and(...conditions)).orderBy(peopleTable.name);
  } else {
    results = await query.orderBy(peopleTable.name);
  }

  res.json(results);
});

router.post("/people", async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [person] = await db.insert(peopleTable).values(parsed.data).returning();
  logAudit(req, "create", "person", person.id, null, person);
  res.status(201).json(person);
});

router.get("/people/:id", async (req, res): Promise<void> => {
  const params = GetPersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));
  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  res.json(person);
});

router.patch("/people/:id", async (req, res): Promise<void> => {
  const params = UpdatePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));

  const [person] = await db
    .update(peopleTable)
    .set(parsed.data)
    .where(eq(peopleTable.id, params.data.id))
    .returning();

  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  logAudit(req, "update", "person", person.id, before ?? null, person);
  res.json(person);
});

router.delete("/people/:id", async (req, res): Promise<void> => {
  const params = DeletePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db
    .delete(peopleTable)
    .where(eq(peopleTable.id, params.data.id))
    .returning();

  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  logAudit(req, "delete", "person", person.id, person, null);
  res.sendStatus(204);
});

router.get("/people/:id/engagement", async (req, res): Promise<void> => {
  const params = GetPersonEngagementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));
  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  // Get invitations with event data
  const invitations = await db
    .select({
      id: invitationsTable.id,
      eventId: invitationsTable.eventId,
      personId: invitationsTable.personId,
      status: invitationsTable.status,
      notes: invitationsTable.notes,
      createdAt: invitationsTable.createdAt,
      updatedAt: invitationsTable.updatedAt,
      event: {
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        location: eventsTable.location,
        city: eventsTable.city,
        state: eventsTable.state,
        startDate: eventsTable.startDate,
        endDate: eventsTable.endDate,
        eventType: eventsTable.eventType,
        createdAt: eventsTable.createdAt,
      },
    })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.personId, params.data.id))
    .orderBy(desc(eventsTable.startDate));

  // Get virtual meetings
  const participations = await db
    .select({ meetingId: virtualMeetingParticipantsTable.meetingId })
    .from(virtualMeetingParticipantsTable)
    .where(eq(virtualMeetingParticipantsTable.personId, params.data.id));

  const meetingIds = participations.map((p) => p.meetingId);
  let virtualMeetings: typeof virtualMeetingsTable.$inferSelect[] = [];
  if (meetingIds.length > 0) {
    virtualMeetings = await db
      .select()
      .from(virtualMeetingsTable)
      .where(
        meetingIds.length === 1
          ? eq(virtualMeetingsTable.id, meetingIds[0])
          : undefined
      )
      .orderBy(desc(virtualMeetingsTable.scheduledDate));
    // Fallback: filter client-side if needed
    if (meetingIds.length > 1) {
      const all = await db.select().from(virtualMeetingsTable).orderBy(desc(virtualMeetingsTable.scheduledDate));
      virtualMeetings = all.filter((m) => meetingIds.includes(m.id));
    }
  }

  // Calculate days since last touchpoint
  const allDates: Date[] = [];
  for (const inv of invitations) {
    if (inv.status === "attended") allDates.push(new Date(inv.event.startDate));
  }
  for (const vm of virtualMeetings) {
    if (vm.status === "completed" && vm.scheduledDate) allDates.push(new Date(vm.scheduledDate));
  }

  const daysSinceLastTouchpoint = allDates.length > 0
    ? Math.floor((Date.now() - Math.max(...allDates.map((d) => d.getTime()))) / (1000 * 60 * 60 * 24))
    : null;

  const totalInPersonAttended = invitations.filter((i) => i.status === "attended").length;
  const totalVirtualCompleted = virtualMeetings.filter((m) => m.status === "completed").length;

  res.json({
    person,
    invitations: invitations.map((inv) => ({
      ...inv,
      person,
    })),
    virtualMeetings: virtualMeetings.map((vm) => ({
      ...vm,
      participantCount: 0,
    })),
    daysSinceLastTouchpoint,
    totalInPersonAttended,
    totalVirtualCompleted,
  });
});

export default router;
