import { Router, type IRouter } from "express";
import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../lib/audit";
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
import {
  getGraphAccessToken,
  createTeamsMeeting,
  cancelTeamsMeeting,
  updateTeamsMeeting,
} from "../lib/graph";
import { eventTouchesScope } from "../lib/scope";
import { resolveRequestFocus } from "../lib/scope-request";

const router: IRouter = Router();

/** Convert a Zod-coerced Date (or already-string) to 'YYYY-MM-DD' for Drizzle date columns. */
const toDateStr = (d: Date | string): string =>
  d instanceof Date ? d.toISOString().split("T")[0] : d;

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
    touchPersonIds: [
      ...participants.map((p) => p.personId),
      meeting.hostId,
    ].filter((id): id is number => typeof id === "number"),
  };
}

// ── Shared Teams meeting provisioning ─────────────────────────────────────────
//
// Called any time a meeting enters "scheduled" status — whether via POST
// (created as scheduled) or PATCH (transitioned from another status).
// Returns the persisted URL + ID pair, or null if Graph is unavailable.

async function provisionTeamsMeeting(
  req: Request,
  meetingId: number,
  title: string,
  scheduledDate: string | null | undefined,
): Promise<{ teamsJoinUrl: string; graphMeetingId: string } | null> {
  try {
    const token = await getGraphAccessToken(req);
    if (!token) return null;

    // Use the scheduled date at 10:00–11:00 UTC; fall back to today + 7 days.
    const baseDate = scheduledDate
      ? scheduledDate
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const teamsResult = await createTeamsMeeting(token, {
      subject: title,
      startDateTime: `${baseDate}T10:00:00Z`,
      endDateTime: `${baseDate}T11:00:00Z`,
    });

    if (!teamsResult) return null;

    await db
      .update(virtualMeetingsTable)
      .set({
        teamsJoinUrl: teamsResult.joinUrl,
        graphMeetingId: teamsResult.meetingId,
      })
      .where(eq(virtualMeetingsTable.id, meetingId));

    return { teamsJoinUrl: teamsResult.joinUrl, graphMeetingId: teamsResult.meetingId };
  } catch (err) {
    console.warn("[virtualMeetings] Non-fatal Teams provisioning error:", String(err));
    return null;
  }
}

async function cancelTeamsMeetingForRecord(
  req: Request,
  graphMeetingId: string,
): Promise<void> {
  try {
    const token = await getGraphAccessToken(req);
    if (token) await cancelTeamsMeeting(token, graphMeetingId);
  } catch (err) {
    console.warn("[virtualMeetings] Non-fatal Teams cancel error:", String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
  if (enriched.length === 0) {
    res.json([]);
    return;
  }

  const { scope, focus } = await resolveRequestFocus(req);
  const visible =
    scope.lens === "all"
      ? enriched
      : enriched.filter((m) => eventTouchesScope(m.touchPersonIds, focus));
  res.json(
    visible.map(({ touchPersonIds: _ids, ...rest }) => rest),
  );
});

router.post("/virtual-meetings", async (req, res): Promise<void> => {
  const parsed = CreateVirtualMeetingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [meeting] = await db
    .insert(virtualMeetingsTable)
    .values({
      ...parsed.data,
      scheduledDate: parsed.data.scheduledDate ? toDateStr(parsed.data.scheduledDate) : undefined,
      meetingKind: ["general", "hrbp_1on1", "leader_1on1", "skip_level"].includes(
        String((req.body as { meetingKind?: string }).meetingKind),
      )
        ? (req.body as { meetingKind: "general" | "hrbp_1on1" | "leader_1on1" | "skip_level" }).meetingKind
        : "general",
    })
    .returning();

  // ── Teams provisioning for meetings created directly as "scheduled" ───────
  // When a leader schedules a meeting from the Suggestions Hub without going
  // through the suggested→scheduled transition, Teams must still be provisioned.
  if (meeting.status === "scheduled" && !meeting.teamsJoinUrl) {
    const teamsData = await provisionTeamsMeeting(
      req,
      meeting.id,
      meeting.title,
      meeting.scheduledDate,
    );
    if (teamsData) {
      meeting.teamsJoinUrl = teamsData.teamsJoinUrl;
      meeting.graphMeetingId = teamsData.graphMeetingId;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const result = await meetingWithMeta(meeting);
  logAudit(req, "create", "virtual_meeting", meeting.id, null, meeting);
  res.status(201).json(result);
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

  // Pre-fetch to read the previous status and Teams IDs before mutation.
  const [current] = await db
    .select()
    .from(virtualMeetingsTable)
    .where(eq(virtualMeetingsTable.id, params.data.id));

  if (!current) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  const { scheduledDate, ...restData } = parsed.data;
  const setData: Record<string, unknown> = {
    ...restData,
    ...(scheduledDate !== undefined
      ? { scheduledDate: scheduledDate ? toDateStr(scheduledDate) : undefined }
      : {}),
  };

  const [meeting] = await db
    .update(virtualMeetingsTable)
    .set(setData)
    .where(eq(virtualMeetingsTable.id, params.data.id))
    .returning();

  if (!meeting) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  // ── Teams meeting lifecycle via shared helper ─────────────────────────────
  const newStatus = parsed.data.status;

  if (newStatus === "scheduled" && current.status !== "scheduled") {
    if (!meeting.teamsJoinUrl) {
      const teamsData = await provisionTeamsMeeting(
        req,
        meeting.id,
        meeting.title,
        meeting.scheduledDate,
      );
      if (teamsData) {
        meeting.teamsJoinUrl = teamsData.teamsJoinUrl;
        meeting.graphMeetingId = teamsData.graphMeetingId;
      }
    }
  } else if (
    current.status === "scheduled" &&
    (!newStatus || newStatus === "scheduled") &&
    scheduledDate !== undefined &&
    meeting.scheduledDate !== current.scheduledDate &&
    meeting.graphMeetingId
  ) {
    // The meeting stays scheduled but the date changed — update the existing
    // Teams meeting so participants' calendars reflect the new time.
    // This is best-effort: the PATCH succeeds even if Graph is unavailable.
    try {
      const token = await getGraphAccessToken(req);
      if (token) {
        const newDateStr = meeting.scheduledDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const updated = await updateTeamsMeeting(token, meeting.graphMeetingId, {
          startDateTime: `${newDateStr}T10:00:00Z`,
          endDateTime: `${newDateStr}T11:00:00Z`,
        });
        if (!updated) {
          console.warn(
            "[virtualMeetings] Non-fatal: Teams meeting time update failed for meeting",
            meeting.id,
            "— join URL preserved, calendar may show old date",
          );
        }
      }
    } catch (err) {
      console.warn("[virtualMeetings] Non-fatal Teams reschedule error:", String(err));
    }
  } else if (newStatus === "cancelled" && current.status !== "cancelled") {
    // Cancel the Graph meeting (best-effort) then clear the persisted IDs so
    // the UI no longer shows the now-dead join link, and so that transitioning
    // this record back to "scheduled" provisions a fresh Teams meeting rather
    // than retaining the stale/invalid data.
    if (meeting.graphMeetingId) {
      await cancelTeamsMeetingForRecord(req, meeting.graphMeetingId);
    }
    await db
      .update(virtualMeetingsTable)
      .set({ teamsJoinUrl: null, graphMeetingId: null })
      .where(eq(virtualMeetingsTable.id, meeting.id));
    meeting.teamsJoinUrl = null;
    meeting.graphMeetingId = null;
  }
  // ─────────────────────────────────────────────────────────────────────────

  logAudit(req, "update", "virtual_meeting", meeting.id, current, meeting);
  res.json(await meetingWithMeta(meeting));
});

router.delete("/virtual-meetings/:id", async (req, res): Promise<void> => {
  const params = DeleteVirtualMeetingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(virtualMeetingsTable)
    .where(eq(virtualMeetingsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Virtual meeting not found" });
    return;
  }

  if (existing.graphMeetingId) {
    await cancelTeamsMeetingForRecord(req, existing.graphMeetingId);
  }

  await db
    .delete(virtualMeetingsTable)
    .where(eq(virtualMeetingsTable.id, params.data.id));

  logAudit(req, "delete", "virtual_meeting", existing.id, existing, null);
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

  logAudit(
    req, "create", "meeting_participant",
    `${params.data.id}:${parsed.data.personId}`,
    null, row ?? null,
  );
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

  logAudit(
    req, "delete", "meeting_participant",
    `${params.data.meetingId}:${params.data.personId}`,
    { meetingId: params.data.meetingId, personId: params.data.personId }, null,
  );
  res.sendStatus(204);
});

export default router;
