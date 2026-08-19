import { describe, it, expect } from "vitest";
import {
  parseScopeQuery,
  inFocusIds,
  collectSubtree,
  collectAncestors,
  orgChartNodeIds,
  effectiveManagerId,
  eventTouchesScope,
  effectiveScope,
  type ScopePerson,
  type ScopeViewer,
} from "../lib/scope";

function p(
  id: number,
  extra: Partial<ScopePerson> = {},
): ScopePerson {
  return {
    id,
    managerId: extra.managerId ?? null,
    departmentId: extra.departmentId ?? null,
    hrbpId: extra.hrbpId ?? null,
    status: extra.status ?? "active",
  };
}

const people: ScopePerson[] = [
  p(1),
  p(2, { managerId: 1, departmentId: 10, hrbpId: 9 }),
  p(3, { managerId: 2, departmentId: 11, hrbpId: 8 }),
  p(4, { managerId: 3, departmentId: 11, hrbpId: 8 }),
  p(5, { managerId: 2, departmentId: 12, hrbpId: 8 }),
  p(8),
  p(9),
  p(10, { managerId: 3, departmentId: 11, hrbpId: 8, status: "inactive" }),
];

const hrbpViewer: ScopeViewer = { personId: 8, isHrbp: true, appRole: "hrbp" };
const leaderViewer: ScopeViewer = { personId: 2, isHrbp: false, appRole: "leader" };
const adminViewer: ScopeViewer = { personId: null, isHrbp: false, appRole: "admin" };

describe("parseScopeQuery", () => {
  it("defaults to my_team", () => {
    expect(parseScopeQuery({}).lens).toBe("my_team");
    expect(parseScopeQuery({}).includeInactive).toBe(false);
  });

  it("parses comma-separated department ids", () => {
    expect(parseScopeQuery({ lens: "departments", departmentIds: "11,12" }).departmentIds).toEqual([
      11, 12,
    ]);
  });

  it("falls back on unknown lens", () => {
    expect(parseScopeQuery({ lens: "nope" }).lens).toBe("my_team");
  });
});

describe("effectiveManagerId", () => {
  it("skips inactive managers so FMLA does not orphan reports", () => {
    const withInactiveMgr: ScopePerson[] = [
      p(1),
      p(2, { managerId: 1, status: "inactive" }),
      p(3, { managerId: 2 }),
    ];
    const map = new Map(withInactiveMgr.map((x) => [x.id, x]));
    expect(effectiveManagerId(withInactiveMgr[2], map, false)).toBe(1);
    expect(effectiveManagerId(withInactiveMgr[2], map, true)).toBe(2);
  });
});

describe("collectSubtree", () => {
  it("includes the leader and every descendant", () => {
    const map = new Map(people.map((x) => [x.id, x]));
    const tree = collectSubtree(2, people, map, false);
    expect(tree.has(2)).toBe(true);
    expect(tree.has(3)).toBe(true);
    expect(tree.has(4)).toBe(true);
    expect(tree.has(5)).toBe(true);
    expect(tree.has(1)).toBe(false);
    expect(tree.has(10)).toBe(false);
  });
});

describe("inFocusIds", () => {
  it("my_team for an HRBP is explicit assignment, not the department", () => {
    const ids = inFocusIds(people, {
      lens: "my_team",
      departmentIds: [],
      leaderId: null,
      hrbpId: null,
      includeInactive: false,
    }, hrbpViewer);
    expect([...ids].sort()).toEqual([3, 4, 5]);
    expect(ids.has(2)).toBe(false); // VP is assigned to a different HRBP
    expect(ids.has(10)).toBe(false); // inactive
  });

  it("includeInactive adds FMLA / leave people", () => {
    const ids = inFocusIds(people, {
      lens: "my_team",
      departmentIds: [],
      leaderId: null,
      hrbpId: null,
      includeInactive: true,
    }, hrbpViewer);
    expect(ids.has(10)).toBe(true);
  });

  it("departments is multi-select and includes other HRBPs' people", () => {
    const ids = inFocusIds(people, {
      lens: "departments",
      departmentIds: [11],
      leaderId: null,
      hrbpId: null,
      includeInactive: false,
    }, hrbpViewer);
    expect([...ids].sort()).toEqual([3, 4]);
  });

  it("leader lens is the full subtree", () => {
    const ids = inFocusIds(people, {
      lens: "leader",
      departmentIds: [],
      leaderId: 2,
      hrbpId: null,
      includeInactive: false,
    }, hrbpViewer);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(4)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });

  it("another HRBP's team uses hrbpId", () => {
    const ids = inFocusIds(people, {
      lens: "hrbp",
      departmentIds: [],
      leaderId: null,
      hrbpId: 9,
      includeInactive: false,
    }, hrbpViewer);
    expect([...ids]).toEqual([2]);
  });

  it("leaders without isHrbp get their reporting subtree as My team", () => {
    const ids = inFocusIds(people, {
      lens: "my_team",
      departmentIds: [],
      leaderId: null,
      hrbpId: null,
      includeInactive: false,
    }, leaderViewer);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(4)).toBe(true);
  });

  it("admin with no directory person has an empty My team", () => {
    const ids = inFocusIds(people, {
      lens: "my_team",
      departmentIds: [],
      leaderId: null,
      hrbpId: null,
      includeInactive: false,
    }, adminViewer);
    expect(ids.size).toBe(0);
  });
});

describe("orgChartNodeIds", () => {
  it("mutes out-of-scope managers so the tree stays connected", () => {
    const { focus, muted } = orgChartNodeIds(
      people,
      { lens: "my_team", departmentIds: [], leaderId: null, hrbpId: null, includeInactive: false },
      hrbpViewer,
    );
    expect(focus.has(4)).toBe(true);
    expect(muted.has(2)).toBe(true); // VP is not in caseload but sits above
    expect(muted.has(1)).toBe(true);
    expect(focus.has(2)).toBe(false);
  });
});

describe("effectiveScope", () => {
  it("lets unmatched admins default My team to Everyone", () => {
    const scoped = effectiveScope(
      { lens: "my_team", departmentIds: [], leaderId: null, hrbpId: null, includeInactive: false },
      { personId: null, isHrbp: false, appRole: "admin" },
    );
    expect(scoped.lens).toBe("all");
  });

  it("does not override an HRBP My team", () => {
    const scoped = effectiveScope(
      { lens: "my_team", departmentIds: [], leaderId: null, hrbpId: null, includeInactive: false },
      { personId: 8, isHrbp: true, appRole: "hrbp" },
    );
    expect(scoped.lens).toBe("my_team");
  });
});

describe("collectAncestors", () => {
  it("walks to the root", () => {
    const map = new Map(people.map((x) => [x.id, x]));
    expect(collectAncestors(4, map, false)).toEqual([3, 2, 1]);
  });
});

describe("eventTouchesScope", () => {
  it("flags events that involve anyone in focus", () => {
    expect(eventTouchesScope([99, 4], new Set([4, 5]))).toBe(true);
    expect(eventTouchesScope([99], new Set([4, 5]))).toBe(false);
  });
});
