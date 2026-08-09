import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  virtualMeetingsTable,
  virtualMeetingParticipantsTable,
  peopleTable,
} from "@workspace/db";
import {
  ListVirtualMeetingsQueryParams,
  CreateVirtualMeetingBody,
  GetVirtualMeetingParams,
  UpdateVirtualMeetingParams,
  UpdateVirtualMeetingBody,
  DeleteVirtualMeetingParams,
  ListVirtualMeetingParticipantsParams,
  AddVirtualMeetingParticipantParams,
  AddVirtualMeetingParticipantBody,
  RemoveVirtualMeetingParticipantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function meetingWithMeta(meeting: typeof virtualMeetingsTable.$inferSelect) {
  const participants = await db
    .select()
    .from(virtualMeetingParticipantsTable)
    .where(eq(virtualMeetingParticipantsTable.meetingId, meeting.id));

  let host = null;
  if (meeting.hostId) {
    const [h] = await db.select().from(peopleTable).where(eq(peopleTable.id, meeting.hostId));
    host = h ?? null;
  }

  return {
    ...meeting,
    host,
    participantCount: participants.length,
  };
}

router.get("/virtual-meetings", async (req, res): Promise<void> => {
  const parsed = ListVirtualMeetingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const meetings = parsed.data.status
    ? await db
        .select()
        .from(virtualMeetingsTable)
        .where(eq(virtualMeetingsTable.status, parsed.data.status))
        .orderBy(virtualMeetingsTable.scheduledDate)
    : await db.select().from(virtualMeetingsTable).orderBy(virtualMeetingsTable.scheduledDate);

  const enriched = await Promise.all(meetings.map(meetingWithMeta));
  res.json(enriched);
});

router.post("/virtual-meetings", async (req, res): Promise<void> => {
  const parsed = CreateVirtualMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db.insert(virtualMeetingsTable).values(parsed.data).returning();
  res.status(201).json(await meetingWithMeta(meeting));
});

router.get("/virtual-meetings/:id", async (req, res): Promise<void> => {
  const params = GetVirtualMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .select()
    .from(virtualMeetingsTable)
    .where(eq(virtualMeetingsTable.id, params.data.id));

  if (!meeting) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  res.json(await meetingWithMeta(meeting));
});

router.patch("/virtual-meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateVirtualMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVirtualMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .update(virtualMeetingsTable)
    .set(parsed.data)
    .where(eq(virtualMeetingsTable.id, params.data.id))
    .returning();

  if (!meeting) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  res.json(await meetingWithMeta(meeting));
});

router.delete("/virtual-meetings/:id", async (req, res): Promise<void> => {
  const params = DeleteVirtualMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [meeting] = await db
    .delete(virtualMeetingsTable)
    .where(eq(virtualMeetingsTable.id, params.data.id))
    .returning();

  if (!meeting) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  res.sendStatus(204);
});

// Participants
router.get("/virtual-meetings/:id/participants", async (req, res): Promise<void> => {
  const params = ListVirtualMeetingParticipantsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const participants = await db
    .select({ person: peopleTable })
    .from(virtualMeetingParticipantsTable)
    .innerJoin(peopleTable, eq(virtualMeetingParticipantsTable.personId, peopleTable.id))
    .where(eq(virtualMeetingParticipantsTable.meetingId, params.data.id));

  res.json(participants.map((p) => p.person));
});

router.post("/virtual-meetings/:id/participants", async (req, res): Promise<void> => {
  const params = AddVirtualMeetingParticipantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddVirtualMeetingParticipantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(virtualMeetingParticipantsTable)
    .values({ meetingId: params.data.id, personId: parsed.data.personId })
    .returning();

  res.status(201).json(row);
});

router.delete("/virtual-meetings/:meetingId/participants/:personId", async (req, res): Promise<void> => {
  const params = RemoveVirtualMeetingParticipantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(virtualMeetingParticipantsTable)
    .where(
      and(
        eq(virtualMeetingParticipantsTable.meetingId, params.data.meetingId),
        eq(virtualMeetingParticipantsTable.personId, params.data.personId)
      )
    );

  res.sendStatus(204);
});

export default router;
