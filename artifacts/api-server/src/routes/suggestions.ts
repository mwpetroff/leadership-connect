import { Router, type IRouter } from "express";
import { eq, gte } from "drizzle-orm";
import {
  db,
  peopleTable,
  eventsTable,
  eventLeadersTable,
  invitationsTable,
  virtualMeetingParticipantsTable,
  virtualMeetingsTable,
} from "@workspace/db";

const router: IRouter = Router();

const NEEDS_TOUCHPOINT_DAYS = 90;

async function getDaysSinceLastInPersonEvent(personId: number): Promise<number | null> {
  const attended = await db
    .select({ startDate: eventsTable.startDate })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.personId, personId));

  if (attended.length === 0) return null;
  const dates = attended.map((a) => new Date(a.startDate).getTime());
  const latest = Math.max(...dates);
  return Math.floor((Date.now() - latest) / (1000 * 60 * 60 * 24));
}

async function getLastTouchpoint(personId: number): Promise<{
  days: number | null;
  type: string | null;
}> {
  const attended = await db
    .select({ startDate: eventsTable.startDate })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.personId, personId));

  const participations = await db
    .select({ meetingId: virtualMeetingParticipantsTable.meetingId })
    .from(virtualMeetingParticipantsTable)
    .where(eq(virtualMeetingParticipantsTable.personId, personId));

  const meetingIds = participations.map((p) => p.meetingId);
  let virtualDates: { date: Date; type: "virtual" }[] = [];
  if (meetingIds.length > 0) {
    const all = await db.select().from(virtualMeetingsTable).where(eq(virtualMeetingsTable.status, "completed"));
    virtualDates = all
      .filter((m) => meetingIds.includes(m.id) && m.scheduledDate)
      .map((m) => ({ date: new Date(m.scheduledDate!), type: "virtual" as const }));
  }

  const inPersonDates = attended.map((a) => ({
    date: new Date(a.startDate),
    type: "in-person" as const,
  }));

  const allDates = [...inPersonDates, ...virtualDates];
  if (allDates.length === 0) return { days: null, type: null };

  allDates.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = allDates[0];
  const days = Math.floor((Date.now() - latest.date.getTime()) / (1000 * 60 * 60 * 24));
  return { days, type: latest.type };
}

router.get("/suggestions/meetups", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const upcomingEvents = await db
    .select()
    .from(eventsTable)
    .where(gte(eventsTable.startDate, today))
    .orderBy(eventsTable.startDate)
    .limit(10);

  const allStaff = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.role, "staff"));

  const suggestions = await Promise.all(
    upcomingEvents.map(async (event) => {
      // Leaders attending this event
      const leaders = await db
        .select({ person: peopleTable })
        .from(eventLeadersTable)
        .innerJoin(peopleTable, eq(eventLeadersTable.personId, peopleTable.id))
        .where(eq(eventLeadersTable.eventId, event.id));

      // Already invited people
      const invitations = await db
        .select()
        .from(invitationsTable)
        .where(eq(invitationsTable.eventId, event.id));
      const invitedIds = new Set(invitations.map((i) => i.personId));

      // Suggest staff near the event (same state, not yet invited)
      const nearbyStaff = allStaff.filter(
        (s) => s.homeState.toLowerCase() === event.state.toLowerCase() && !invitedIds.has(s.id)
      );

      // Also suggest same city
      const sameCityStaff = allStaff.filter(
        (s) => s.homeCity.toLowerCase() === event.city.toLowerCase() && !invitedIds.has(s.id)
      );
      const sameCityIds = new Set(sameCityStaff.map((s) => s.id));

      const suggestedPeople = await Promise.all(
        nearbyStaff.slice(0, 10).map(async (person) => {
          const days = await getDaysSinceLastInPersonEvent(person.id);
          const isNearby = sameCityIds.has(person.id);
          return {
            person,
            reason: isNearby
              ? `Located in ${event.city} — same city as the event`
              : `Located in ${person.homeCity}, ${person.homeState} — same state as the event`,
            daysSinceLastEvent: days,
          };
        })
      );

      // Sort: no recent events first
      suggestedPeople.sort((a, b) => {
        if (a.daysSinceLastEvent === null) return -1;
        if (b.daysSinceLastEvent === null) return 1;
        return b.daysSinceLastEvent - a.daysSinceLastEvent;
      });

      return {
        event: {
          ...event,
          leaderCount: leaders.length,
          inviteeCount: invitations.length,
          attendeeCount: invitations.filter((i) => i.status === "attended").length,
        },
        leaders: leaders.map((l) => l.person),
        suggestedPeople: suggestedPeople.slice(0, 8),
      };
    })
  );

  // Only include events that have leaders attending (otherwise nothing to suggest)
  const filtered = suggestions.filter((s) => s.leaders.length > 0 || s.suggestedPeople.length > 0);
  res.json(filtered);
});

router.get("/suggestions/virtual", async (_req, res): Promise<void> => {
  const allStaff = await db.select().from(peopleTable).where(eq(peopleTable.role, "staff"));
  const leaders = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.role, "executive"));

  const staffWithTouchpoints = await Promise.all(
    allStaff.map(async (person) => {
      const { days, type } = await getLastTouchpoint(person.id);
      return { person, days, type };
    })
  );

  const needsVirtual = staffWithTouchpoints.filter(
    ({ days }) => days === null || days >= NEEDS_TOUCHPOINT_DAYS
  );

  // Sort: no engagement first, then longest gap
  needsVirtual.sort((a, b) => {
    if (a.days === null) return -1;
    if (b.days === null) return 1;
    return b.days - a.days;
  });

  const suggestions = needsVirtual.slice(0, 20).map(({ person, days, type }) => ({
    person,
    daysSinceLastTouchpoint: days,
    lastTouchpointType: type,
    reason:
      days === null
        ? "Has never had a touchpoint with leadership"
        : `Last touchpoint was ${days} days ago`,
    suggestedLeaders: leaders.slice(0, 3),
  }));

  res.json(suggestions);
});

export default router;
