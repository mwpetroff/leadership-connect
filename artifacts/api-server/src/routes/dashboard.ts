import { Router, type IRouter } from "express";
import { eq, gte, desc } from "drizzle-orm";
import {
  db,
  peopleTable,
  eventsTable,
  invitationsTable,
  virtualMeetingsTable,
  virtualMeetingParticipantsTable,
} from "@workspace/db";
import { getTouchpointThresholdDays } from "../lib/settings-store";

const router: IRouter = Router();

async function getDaysSinceLastTouchpoint(personId: number): Promise<number | null> {
  const attended = await db
    .select({ startDate: eventsTable.startDate })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.personId, personId));

  const attended90 = attended.filter((a) => a.startDate).map((a) => new Date(a.startDate).getTime());

  const participations = await db
    .select({ meetingId: virtualMeetingParticipantsTable.meetingId })
    .from(virtualMeetingParticipantsTable)
    .where(eq(virtualMeetingParticipantsTable.personId, personId));

  const meetingIds = participations.map((p) => p.meetingId);
  let virtualDates: number[] = [];
  if (meetingIds.length > 0) {
    const all = await db
      .select()
      .from(virtualMeetingsTable)
      .where(eq(virtualMeetingsTable.status, "completed"));
    virtualDates = all
      .filter((m) => meetingIds.includes(m.id) && m.scheduledDate)
      .map((m) => new Date(m.scheduledDate!).getTime());
  }

  const allDates = [...attended90, ...virtualDates];
  if (allDates.length === 0) return null;

  const latestMs = Math.max(...allDates);
  return Math.floor((Date.now() - latestMs) / (1000 * 60 * 60 * 24));
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const allPeople = await db.select().from(peopleTable).orderBy(peopleTable.name);
  const allEvents = await db.select().from(eventsTable).orderBy(eventsTable.startDate);

  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = allEvents.filter((e) => e.startDate >= today);

  const totalExecutives = allPeople.filter((p) => p.role === "executive").length;
  const totalSecondaryLeaders = allPeople.filter((p) => p.role === "secondary_leader").length;
  const totalStaff = allPeople.filter((p) => p.role === "staff").length;

  // Find staff needing touchpoint (no touchpoint in threshold+ days or never)
  const thresholdDays = await getTouchpointThresholdDays();
  const staffPeople = allPeople.filter((p) => p.role === "staff");
  const staffWithDays = await Promise.all(
    staffPeople.map(async (p) => ({ person: p, days: await getDaysSinceLastTouchpoint(p.id) }))
  );
  const needsTouchpoint = staffWithDays
    .filter(({ days }) => days === null || days >= thresholdDays)
    .map(({ person }) => person)
    .slice(0, 10);

  // Recent activity (last 20 events from invitations + people added)
  const recentInvitations = await db
    .select({
      id: invitationsTable.id,
      status: invitationsTable.status,
      createdAt: invitationsTable.createdAt,
      personId: invitationsTable.personId,
      eventId: invitationsTable.eventId,
    })
    .from(invitationsTable)
    .orderBy(desc(invitationsTable.createdAt))
    .limit(10);

  const recentMeetings = await db
    .select()
    .from(virtualMeetingsTable)
    .orderBy(desc(virtualMeetingsTable.createdAt))
    .limit(5);

  const recentPeople = await db
    .select()
    .from(peopleTable)
    .orderBy(desc(peopleTable.createdAt))
    .limit(5);

  const activityItems: {
    type: "invitation" | "attendance" | "virtual_meeting" | "person_added" | "event_added";
    description: string;
    timestamp: Date;
    personName: string | null;
    eventName: string | null;
  }[] = [];

  for (const inv of recentInvitations) {
    const [person] = allPeople.filter((p) => p.id === inv.personId);
    const [event] = allEvents.filter((e) => e.id === inv.eventId);
    if (inv.status === "attended") {
      activityItems.push({
        type: "attendance",
        description: `${person?.name ?? "Someone"} attended ${event?.name ?? "an event"}`,
        timestamp: inv.createdAt,
        personName: person?.name ?? null,
        eventName: event?.name ?? null,
      });
    } else {
      activityItems.push({
        type: "invitation",
        description: `${person?.name ?? "Someone"} invited to ${event?.name ?? "an event"}`,
        timestamp: inv.createdAt,
        personName: person?.name ?? null,
        eventName: event?.name ?? null,
      });
    }
  }

  for (const vm of recentMeetings) {
    activityItems.push({
      type: "virtual_meeting",
      description: `Virtual meeting created: ${vm.title}`,
      timestamp: vm.createdAt,
      personName: null,
      eventName: null,
    });
  }

  for (const person of recentPeople) {
    activityItems.push({
      type: "person_added",
      description: `${person.name} added to the platform`,
      timestamp: person.createdAt,
      personName: person.name,
      eventName: null,
    });
  }

  activityItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Engagement by role
  const roles = ["executive", "secondary_leader", "staff"] as const;
  const engagementByRole = await Promise.all(
    roles.map(async (role) => {
      const people = allPeople.filter((p) => p.role === role);
      let recentlyEngaged = 0;
      for (const p of people) {
        const days = await getDaysSinceLastTouchpoint(p.id);
        if (days !== null && days < thresholdDays) recentlyEngaged++;
      }
      const neverEngaged = people.filter(async (p) => {
        const days = await getDaysSinceLastTouchpoint(p.id);
        return days === null;
      }).length;
      return { role, total: people.length, recentlyEngaged, neverEngaged };
    })
  );

  res.json({
    totalPeople: allPeople.length,
    totalEvents: allEvents.length,
    upcomingEvents: upcomingEvents.length,
    totalExecutives,
    totalSecondaryLeaders,
    totalStaff,
    staffNeedingTouchpoint: needsTouchpoint.length,
    recentActivity: activityItems.slice(0, 20),
    engagementByRole,
    needsTouchpoint,
  });
});

export default router;
