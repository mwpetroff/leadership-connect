/**
 * Four independent coverage clocks for Touchpoint.
 *
 * Thresholds:
 *   - HRBP 1:1 and onsite × leadership: organisation settings
 *   - Leadership 1:1 and skip-level: per-department, falling back to org defaults
 */

export type GapKind = "hrbp_1on1" | "leader_1on1" | "skip_level" | "onsite_leadership";

export const DEFAULT_CADENCES = {
  hrbp_1on1: 30,
  leader_1on1: 14,
  skip_level: 90,
  onsite_leadership: 180,
} as const;

export interface CadenceDefaults {
  hrbp_1on1: number;
  leader_1on1: number;
  skip_level: number;
  onsite_leadership: number;
}

export interface CoveragePerson {
  id: number;
  managerId: number | null;
  departmentId: number | null;
  hrbpId: number | null;
  status: "active" | "inactive";
}

export interface DepartmentCadence {
  id: number;
  leadershipOneOnOneDays: number | null;
  skipLevelDays: number | null;
}

export interface CompletedMeeting {
  participantId: number;
  kind: "general" | "hrbp_1on1" | "leader_1on1" | "skip_level";
  completedOn: Date;
}

export interface OnsiteAttendance {
  personId: number;
  eventDate: Date;
  /** True when the event had at least one executive or secondary leader on the roster. */
  hadLeadership: boolean;
}

export interface GapResult {
  kind: GapKind;
  daysSince: number | null;
  thresholdDays: number;
  overdue: boolean;
  notApplicable: boolean;
}

export interface PersonCoverage {
  personId: number;
  gaps: GapResult[];
  overdueCount: number;
}

function daysBetween(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveCadence(
  departmentValue: number | null | undefined,
  orgDefault: number,
): number {
  if (departmentValue != null && departmentValue > 0) return departmentValue;
  return orgDefault;
}

/** Direct manager's manager, or null when there is no skip (CEO's reports, missing manager). */
export function skipLevelId(
  person: CoveragePerson,
  peopleById: Map<number, CoveragePerson>,
): number | null {
  if (person.managerId == null) return null;
  const manager = peopleById.get(person.managerId);
  if (!manager || manager.managerId == null) return null;
  if (manager.managerId === person.id) return null;
  return manager.managerId;
}

export function isOverdue(daysSince: number | null, thresholdDays: number): boolean {
  if (daysSince == null) return true;
  return daysSince >= thresholdDays;
}

function latestDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

export function evaluateGaps(args: {
  person: CoveragePerson;
  peopleById: Map<number, CoveragePerson>;
  department: DepartmentCadence | null;
  org: CadenceDefaults;
  meetings: CompletedMeeting[];
  onsite: OnsiteAttendance[];
  now?: Date;
}): GapResult[] {
  const now = args.now ?? new Date();
  const skipId = skipLevelId(args.person, args.peopleById);
  const leaderThreshold = resolveCadence(args.department?.leadershipOneOnOneDays, args.org.leader_1on1);
  const skipThreshold = resolveCadence(args.department?.skipLevelDays, args.org.skip_level);

  const mine = args.meetings.filter((m) => m.participantId === args.person.id);
  const hrbpDates = mine.filter((m) => m.kind === "hrbp_1on1").map((m) => m.completedOn);
  const leaderDates = mine.filter((m) => m.kind === "leader_1on1").map((m) => m.completedOn);
  const skipDates = mine.filter((m) => m.kind === "skip_level").map((m) => m.completedOn);
  const onsiteDates = args.onsite
    .filter((o) => o.personId === args.person.id && o.hadLeadership)
    .map((o) => o.eventDate);

  function clock(kind: GapKind, dates: Date[], thresholdDays: number, notApplicable: boolean): GapResult {
    if (notApplicable) {
      return { kind, daysSince: null, thresholdDays, overdue: false, notApplicable: true };
    }
    const latest = latestDate(dates);
    const daysSince = latest ? daysBetween(latest, now) : null;
    return {
      kind,
      daysSince,
      thresholdDays,
      overdue: isOverdue(daysSince, thresholdDays),
      notApplicable: false,
    };
  }

  return [
    clock("hrbp_1on1", hrbpDates, args.org.hrbp_1on1, false),
    clock("leader_1on1", leaderDates, leaderThreshold, false),
    clock("skip_level", skipDates, skipThreshold, skipId == null),
    clock("onsite_leadership", onsiteDates, args.org.onsite_leadership, false),
  ];
}

export function coverageForPeople(args: {
  people: CoveragePerson[];
  departments: DepartmentCadence[];
  org: CadenceDefaults;
  meetings: CompletedMeeting[];
  onsite: OnsiteAttendance[];
  focusIds: Set<number>;
  now?: Date;
}): PersonCoverage[] {
  const peopleById = new Map(args.people.map((p) => [p.id, p]));
  const deptById = new Map(args.departments.map((d) => [d.id, d]));
  const rows: PersonCoverage[] = [];

  for (const person of args.people) {
    if (!args.focusIds.has(person.id)) continue;
    if (person.status !== "active") continue;
    const gaps = evaluateGaps({
      person,
      peopleById,
      department: person.departmentId != null ? deptById.get(person.departmentId) ?? null : null,
      org: args.org,
      meetings: args.meetings,
      onsite: args.onsite,
      now: args.now,
    });
    rows.push({
      personId: person.id,
      gaps,
      overdueCount: gaps.filter((g) => g.overdue).length,
    });
  }

  rows.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    const maxOverdue = (row: PersonCoverage) =>
      Math.max(0, ...row.gaps.filter((g) => g.overdue).map((g) => g.daysSince ?? Number.POSITIVE_INFINITY));
    const byAge = maxOverdue(b) - maxOverdue(a);
    if (byAge !== 0) return byAge;
    return a.personId - b.personId;
  });
  return rows;
}

export const GAP_LABELS: Record<GapKind, string> = {
  hrbp_1on1: "HRBP 1:1",
  leader_1on1: "Leadership 1:1",
  skip_level: "Skip-level 1:1",
  onsite_leadership: "Onsite with leadership",
};
