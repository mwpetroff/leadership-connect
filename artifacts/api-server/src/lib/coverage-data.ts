import { eq } from "drizzle-orm";
import {
  db,
  peopleTable,
  departmentsTable,
  virtualMeetingsTable,
  virtualMeetingParticipantsTable,
  invitationsTable,
  eventsTable,
  eventLeadersTable,
} from "@workspace/db";
import {
  coverageForPeople,
  type CompletedMeeting,
  type CoveragePerson,
  type DepartmentCadence,
  type OnsiteAttendance,
} from "./coverage";
import { getOrgCadences } from "./settings-store";

export async function loadCoverageSnapshot(focusIds: Set<number>, now = new Date()) {
  const [people, departments, participations, completedMeetings, attended, leaders, org] =
    await Promise.all([
      db.select().from(peopleTable),
      db.select().from(departmentsTable),
      db.select().from(virtualMeetingParticipantsTable),
      db.select().from(virtualMeetingsTable).where(eq(virtualMeetingsTable.status, "completed")),
      db
        .select({
          personId: invitationsTable.personId,
          eventId: invitationsTable.eventId,
          eventDate: eventsTable.startDate,
        })
        .from(invitationsTable)
        .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
        .where(eq(invitationsTable.status, "attended")),
      db
        .select({
          eventId: eventLeadersTable.eventId,
          role: peopleTable.role,
        })
        .from(eventLeadersTable)
        .innerJoin(peopleTable, eq(eventLeadersTable.personId, peopleTable.id)),
      getOrgCadences(),
    ]);

  const eventsWithLeadership = new Set(
    leaders
      .filter((l) => l.role === "executive" || l.role === "secondary_leader")
      .map((l) => l.eventId),
  );

  const meetingsById = new Map(completedMeetings.map((m) => [m.id, m]));
  const meetings: CompletedMeeting[] = [];
  for (const part of participations) {
    const meeting = meetingsById.get(part.meetingId);
    if (!meeting || !meeting.scheduledDate) continue;
    meetings.push({
      participantId: part.personId,
      kind: (meeting.meetingKind ?? "general") as CompletedMeeting["kind"],
      completedOn: new Date(meeting.scheduledDate),
    });
  }

  const onsite: OnsiteAttendance[] = attended.map((a) => ({
    personId: a.personId,
    eventDate: new Date(a.eventDate),
    hadLeadership: eventsWithLeadership.has(a.eventId),
  }));

  const coveragePeople: CoveragePerson[] = people.map((p) => ({
    id: p.id,
    managerId: p.managerId,
    departmentId: p.departmentId,
    hrbpId: p.hrbpId,
    status: p.status ?? "active",
  }));

  const deptCadence: DepartmentCadence[] = departments.map((d) => ({
    id: d.id,
    leadershipOneOnOneDays: d.leadershipOneOnOneDays,
    skipLevelDays: d.skipLevelDays,
  }));

  const rows = coverageForPeople({
    people: coveragePeople,
    departments: deptCadence,
    org,
    meetings,
    onsite,
    focusIds,
    now,
  });

  return { people, departments, org, rows };
}
