import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import {
  db,
  peopleTable,
  eventsTable,
  invitationsTable,
  virtualMeetingsTable,
} from "@workspace/db";
import { parseScopeQuery, effectiveScope, inFocusIds, type ScopePerson } from "../lib/scope";
import { resolveViewer } from "../lib/viewer";
import { loadCoverageSnapshot } from "../lib/coverage-data";
import { GAP_LABELS, type GapKind } from "../lib/coverage";
import { toPersonDto } from "../lib/person-dto";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const allPeople = await db.select().from(peopleTable).orderBy(peopleTable.name);
  const allEvents = await db.select().from(eventsTable).orderBy(eventsTable.startDate);
  const viewer = await resolveViewer(req);
  const scope = effectiveScope(parseScopeQuery(req.query as Record<string, unknown>), viewer);
  const scopePeople: ScopePerson[] = allPeople.map((p) => ({
    id: p.id,
    managerId: p.managerId ?? null,
    departmentId: p.departmentId ?? null,
    hrbpId: p.hrbpId ?? null,
    status: p.status ?? "active",
  }));
  const focus = inFocusIds(scopePeople, scope, viewer);
  const focusedPeople = allPeople.filter((p) => focus.has(p.id));

  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = allEvents.filter((e) => e.startDate >= today);

  const snapshot = await loadCoverageSnapshot(focus);
  const personById = new Map(allPeople.map((p) => [p.id, p]));
  const overdueRows = snapshot.rows.filter((r) => r.overdueCount > 0);
  const needsTouchpoint = overdueRows
    .slice(0, 10)
    .map((r) => personById.get(r.personId))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => toPersonDto(p));

  const counts = {
    hrbp_1on1: 0,
    leader_1on1: 0,
    skip_level: 0,
    onsite_leadership: 0,
  };
  for (const row of snapshot.rows) {
    for (const gap of row.gaps) {
      if (gap.overdue) counts[gap.kind] += 1;
    }
  }

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
    const person = allPeople.find((p) => p.id === inv.personId);
    const event = allEvents.find((e) => e.id === inv.eventId);
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

  const roles = ["executive", "secondary_leader", "staff"] as const;
  const engagementByRole = roles.map((role) => {
    const people = focusedPeople.filter((p) => p.role === role);
    const ids = new Set(people.map((p) => p.id));
    const covered = snapshot.rows.filter((r) => ids.has(r.personId));
    const neverEngaged = covered.filter((r) => r.gaps.every((g) => g.daysSince == null && !g.notApplicable)).length;
    const recentlyEngaged = people.length - covered.filter((r) => r.overdueCount > 0).length;
    return { role, total: people.length, recentlyEngaged: Math.max(0, recentlyEngaged), neverEngaged };
  });

  res.json({
    totalPeople: focusedPeople.length,
    totalEvents: allEvents.length,
    upcomingEvents: upcomingEvents.length,
    totalExecutives: focusedPeople.filter((p) => p.role === "executive").length,
    totalSecondaryLeaders: focusedPeople.filter((p) => p.role === "secondary_leader").length,
    totalStaff: focusedPeople.filter((p) => p.role === "staff").length,
    staffNeedingTouchpoint: overdueRows.length,
    recentActivity: activityItems.slice(0, 20),
    engagementByRole,
    needsTouchpoint,
    coverage: {
      counts,
      labels: GAP_LABELS,
      people: snapshot.rows.slice(0, 25).map((row) => ({
        person: personById.get(row.personId) ? toPersonDto(personById.get(row.personId)!) : null,
        overdueCount: row.overdueCount,
        gaps: row.gaps.map((g) => ({
          kind: g.kind as GapKind,
          label: GAP_LABELS[g.kind],
          daysSince: g.daysSince,
          thresholdDays: g.thresholdDays,
          overdue: g.overdue,
          notApplicable: g.notApplicable,
        })),
      })),
    },
  });
});

export default router;
