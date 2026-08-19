import { describe, it, expect } from "vitest";
import {
  DEFAULT_CADENCES,
  resolveCadence,
  skipLevelId,
  isOverdue,
  evaluateGaps,
  coverageForPeople,
  type CoveragePerson,
} from "../lib/coverage";

const ceo: CoveragePerson = { id: 1, managerId: null, departmentId: 10, hrbpId: 8, status: "active" };
const vp: CoveragePerson = { id: 2, managerId: 1, departmentId: 10, hrbpId: 8, status: "active" };
const ic: CoveragePerson = { id: 3, managerId: 2, departmentId: 11, hrbpId: 8, status: "active" };
const peopleById = new Map<number, CoveragePerson>([
  [1, ceo],
  [2, vp],
  [3, ic],
]);

describe("resolveCadence", () => {
  it("prefers the department value when set", () => {
    expect(resolveCadence(21, 14)).toBe(21);
  });

  it("falls back to the org default", () => {
    expect(resolveCadence(null, 14)).toBe(14);
    expect(resolveCadence(0, 14)).toBe(14);
    expect(resolveCadence(undefined, 90)).toBe(90);
  });
});

describe("skipLevelId", () => {
  it("returns the manager's manager", () => {
    expect(skipLevelId(ic, peopleById)).toBe(1);
  });

  it("is N/A for the CEO and for the CEO's direct reports", () => {
    expect(skipLevelId(ceo, peopleById)).toBeNull();
    expect(skipLevelId(vp, peopleById)).toBeNull();
  });
});

describe("isOverdue", () => {
  it("treats never as overdue", () => {
    expect(isOverdue(null, 30)).toBe(true);
  });

  it("is overdue at and after the threshold", () => {
    expect(isOverdue(30, 30)).toBe(true);
    expect(isOverdue(29, 30)).toBe(false);
  });
});

describe("evaluateGaps", () => {
  const now = new Date("2026-08-19T00:00:00Z");

  it("marks CEO skip-level as not applicable, not overdue", () => {
    const gaps = evaluateGaps({
      person: ceo,
      peopleById,
      department: { id: 10, leadershipOneOnOneDays: 14, skipLevelDays: 90 },
      org: DEFAULT_CADENCES,
      meetings: [],
      onsite: [],
      now,
    });
    const skip = gaps.find((g) => g.kind === "skip_level")!;
    expect(skip.notApplicable).toBe(true);
    expect(skip.overdue).toBe(false);
  });

  it("uses department leadership cadence", () => {
    const gaps = evaluateGaps({
      person: ic,
      peopleById,
      department: { id: 11, leadershipOneOnOneDays: 7, skipLevelDays: null },
      org: DEFAULT_CADENCES,
      meetings: [
        { participantId: 3, kind: "leader_1on1", completedOn: new Date("2026-08-10T00:00:00Z") },
      ],
      onsite: [],
      now,
    });
    const leader = gaps.find((g) => g.kind === "leader_1on1")!;
    expect(leader.thresholdDays).toBe(7);
    expect(leader.daysSince).toBe(9);
    expect(leader.overdue).toBe(true);
  });

  it("counts onsite only when leadership was on the event roster", () => {
    const gaps = evaluateGaps({
      person: ic,
      peopleById,
      department: null,
      org: DEFAULT_CADENCES,
      meetings: [],
      onsite: [
        { personId: 3, eventDate: new Date("2026-08-01T00:00:00Z"), hadLeadership: false },
        { personId: 3, eventDate: new Date("2026-07-01T00:00:00Z"), hadLeadership: true },
      ],
      now,
    });
    const onsite = gaps.find((g) => g.kind === "onsite_leadership")!;
    expect(onsite.daysSince).toBe(49);
    expect(onsite.overdue).toBe(false);
  });
});

describe("coverageForPeople", () => {
  it("ranks people with more overdue clocks first and skips inactive", () => {
    const inactive: CoveragePerson = { ...ic, id: 4, status: "inactive" };
    const rows = coverageForPeople({
      // Include the VP so the IC has an applicable skip-level clock.
      people: [ceo, vp, ic, inactive],
      departments: [{ id: 11, leadershipOneOnOneDays: null, skipLevelDays: null }],
      org: DEFAULT_CADENCES,
      meetings: [],
      onsite: [],
      focusIds: new Set([1, 3, 4]),
      now: new Date("2026-08-19T00:00:00Z"),
    });
    expect(rows.map((r) => r.personId)).toEqual([3, 1]);
    expect(rows[0].overdueCount).toBeGreaterThan(rows[1].overdueCount);
  });
});
