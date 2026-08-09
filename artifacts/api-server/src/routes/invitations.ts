import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, invitationsTable, peopleTable, eventsTable } from "@workspace/db";
import {
  ListEventInvitationsParams,
  CreateInvitationParams,
  CreateInvitationBody,
  BulkCreateInvitationsParams,
  BulkCreateInvitationsBody,
  BulkUpdateInvitationsParams,
  BulkUpdateInvitationsBody,
  UpdateInvitationParams,
  UpdateInvitationBody,
  DeleteInvitationParams,
} from "@workspace/api-zod";
import {
  getGraphAccessToken,
  createOutlookCalendarEvent,
  cancelOutlookCalendarEvent,
} from "../lib/graph";

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

  // ── Microsoft Graph: create Outlook calendar event ────────────────────────
  // createCalendarEvent defaults to true; opt out by passing false.
  const wantCalendar = (parsed.data as any).createCalendarEvent !== false;
  if (wantCalendar) {
    try {
      const token = await getGraphAccessToken(req);
      if (token) {
        // Fetch person email and event details for the calendar invite.
        const [person] = await db
          .select()
          .from(peopleTable)
          .where(eq(peopleTable.id, invitation.personId));
        const [event] = await db
          .select()
          .from(eventsTable)
          .where(eq(eventsTable.id, invitation.eventId));

        if (event) {
          // Use event start date at 09:00 UTC; end at 17:00 UTC (full-day placeholder).
          // Suffix Z is required: Graph calendar API requires DateTimeOffset values.
          const startDate = event.startDate;
          const startDateTime = `${startDate}T09:00:00Z`;
          const endDateTime = `${event.endDate ?? startDate}T17:00:00Z`;

          const appBase = process.env.AZURE_AD_REDIRECT_URI
            ? new URL(process.env.AZURE_AD_REDIRECT_URI).origin
            : "";

          const graphEventId = await createOutlookCalendarEvent(token, {
            subject: `${event.name} — Leadership Invitation`,
            startDateTime,
            endDateTime,
            location: `${event.location}, ${event.city}, ${event.state}`,
            bodyHtml: `<p>You have been invited to <strong>${event.name}</strong>.</p>
              <p>📍 ${event.location}, ${event.city}, ${event.state}</p>
              ${appBase ? `<p><a href="${appBase}/events/${event.id}">View event in Leadership Connect</a></p>` : ""}`,
            attendeeEmails: person?.email ? [person.email] : [],
          });

          if (graphEventId) {
            await db
              .update(invitationsTable)
              .set({ graphEventId })
              .where(eq(invitationsTable.id, invitation.id));
            // Reflect in the returned object
            (invitation as any).graphEventId = graphEventId;
          }
        }
      }
    } catch (err) {
      // Graph errors must never fail the invitation save.
      console.warn("[invitations] Non-fatal Graph error:", String(err));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  res.status(201).json(await invitationWithRelations(invitation));
});

// ── POST /events/:id/invitations/bulk ─────────────────────────────────────────
// Creates invitations for multiple people in one request.
// Already-invited people are silently skipped (returned in `skipped` count).
// Calendar-event creation is skipped for bulk invites (too many Graph calls);
// callers may pass createCalendarEvent: false or omit — it defaults to false.
router.post("/events/:id/invitations/bulk", async (req, res): Promise<void> => {
  const params = BulkCreateInvitationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = BulkCreateInvitationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const eventId = params.data.id;
  // Deduplicate personIds within the request so `[1, 1]` does not insert two rows.
  const uniquePersonIds = Array.from(new Set(parsed.data.personIds));

  // Insert with ON CONFLICT DO NOTHING so concurrent single/bulk invite
  // requests cannot race past the read-then-write gap and produce duplicates.
  // The invitations table has a UNIQUE(event_id, person_id) constraint that
  // the database enforces atomically.
  const insertedRows = await db
    .insert(invitationsTable)
    .values(uniquePersonIds.map((personId) => ({ eventId, personId })))
    .onConflictDoNothing()
    .returning();

  // Derive skipped count from the difference between what was requested and
  // what the DB actually inserted. Both duplicates within the request and
  // already-invited people (pre-existing rows) are counted as skipped.
  const created = insertedRows.length;
  const skipped = uniquePersonIds.length - created;

  const enriched = await Promise.all(insertedRows.map(invitationWithRelations));

  res.status(201).json({ created, skipped, invitations: enriched });
});

// ── PATCH /events/:id/invitations/bulk ────────────────────────────────────────
// Bulk-updates invitation statuses. Used for post-event attendance marking.
// Returns the number of rows actually updated (missing IDs are counted as 0).
router.patch("/events/:id/invitations/bulk", async (req, res): Promise<void> => {
  const params = BulkUpdateInvitationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = BulkUpdateInvitationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const eventId = params.data.id;

  // Run updates in parallel; constrain each update to the event in the path
  // so a caller cannot modify invitations belonging to a different event.
  const results = await Promise.all(
    parsed.data.updates.map(({ id, status }) =>
      db
        .update(invitationsTable)
        .set({ status })
        .where(and(eq(invitationsTable.id, id), eq(invitationsTable.eventId, eventId)))
        .returning()
    )
  );

  const updated = results.filter((r) => r.length > 0).length;
  res.json({ updated });
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

  // Fetch first so we have the graphEventId before deletion.
  const [existing] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  // ── Microsoft Graph: cancel Outlook calendar event ────────────────────────
  if (existing.graphEventId) {
    try {
      const token = await getGraphAccessToken(req);
      if (token) {
        await cancelOutlookCalendarEvent(token, existing.graphEventId);
      }
    } catch (err) {
      console.warn("[invitations] Non-fatal Graph cancel error:", String(err));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  await db
    .delete(invitationsTable)
    .where(eq(invitationsTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
