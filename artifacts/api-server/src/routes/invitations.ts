import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, invitationsTable, peopleTable, eventsTable } from "@workspace/db";
import {
  ListEventInvitationsParams,
  CreateInvitationParams,
  CreateInvitationBody,
  UpdateInvitationParams,
  UpdateInvitationBody,
  DeleteInvitationParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function invitationWithRelations(inv: typeof invitationsTable.$inferSelect) {
  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, inv.personId));
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, inv.eventId));

  return {
    ...inv,
    person: person ?? null,
    event: event
      ? { ...event, leaderCount: 0, inviteeCount: 0, attendeeCount: 0 }
      : null,
  };
}

router.get("/events/:id/invitations", async (req, res): Promise<void> => {
  const params = ListEventInvitationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.eventId, params.data.id));

  const enriched = await Promise.all(invitations.map(invitationWithRelations));
  res.json(enriched);
});

router.post("/events/:id/invitations", async (req, res): Promise<void> => {
  const params = CreateInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check for duplicate
  const existing = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.eventId, params.data.id),
        eq(invitationsTable.personId, parsed.data.personId)
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: "Person already invited to this event" });
    return;
  }

  const [invitation] = await db
    .insert(invitationsTable)
    .values({ eventId: params.data.id, personId: parsed.data.personId, notes: parsed.data.notes })
    .returning();

  res.status(201).json(await invitationWithRelations(invitation));
});

router.patch("/invitations/:id", async (req, res): Promise<void> => {
  const params = UpdateInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [invitation] = await db
    .update(invitationsTable)
    .set(parsed.data)
    .where(eq(invitationsTable.id, params.data.id))
    .returning();

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  res.json(await invitationWithRelations(invitation));
});

router.delete("/invitations/:id", async (req, res): Promise<void> => {
  const params = DeleteInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [inv] = await db
    .delete(invitationsTable)
    .where(eq(invitationsTable.id, params.data.id))
    .returning();

  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
