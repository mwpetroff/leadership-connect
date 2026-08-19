/**
 * Population lenses used across People, Org Chart, Dashboard, Map, Events,
 * Meetings, Suggestions, and Search.
 *
 * Lenses are exclusive. Search / role filters stack on top in the route.
 */

export type Lens = "my_team" | "departments" | "leader" | "hrbp" | "all";

export interface ScopeQuery {
  lens: Lens;
  departmentIds: number[];
  leaderId: number | null;
  hrbpId: number | null;
  includeInactive: boolean;
}

export interface ScopePerson {
  id: number;
  managerId: number | null;
  departmentId: number | null;
  hrbpId: number | null;
  status: "active" | "inactive";
}

export interface ScopeViewer {
  personId: number | null;
  isHrbp: boolean;
  appRole: "admin" | "hrbp" | "leader" | "staff";
}

export const DEFAULT_SCOPE: ScopeQuery = {
  lens: "my_team",
  departmentIds: [],
  leaderId: null,
  hrbpId: null,
  includeInactive: false,
};

const LENSES = new Set<Lens>(["my_team", "departments", "leader", "hrbp", "all"]);

function parseIntList(raw: unknown): number[] {
  if (raw == null || raw === "") return [];
  const text = Array.isArray(raw) ? raw.join(",") : String(raw);
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseOptionalInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseBool(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === "1") return true;
  return false;
}

/** Parse lens query params from Express `req.query` (or a plain object). */
export function parseScopeQuery(query: Record<string, unknown>): ScopeQuery {
  const rawLens = String(query.lens ?? "my_team");
  const lens: Lens = LENSES.has(rawLens as Lens) ? (rawLens as Lens) : "my_team";
  return {
    lens,
    departmentIds: parseIntList(query.departmentIds),
    leaderId: parseOptionalInt(query.leaderId),
    hrbpId: parseOptionalInt(query.hrbpId),
    includeInactive: parseBool(query.includeInactive),
  };
}

/** Normalize a DB / DTO person into the fields the lens engine needs. */
export function asScopePerson(p: {
  id: number;
  managerId?: number | null;
  departmentId?: number | null;
  hrbpId?: number | null;
  status?: "active" | "inactive" | null;
}): ScopePerson {
  return {
    id: p.id,
    managerId: p.managerId ?? null,
    departmentId: p.departmentId ?? null,
    hrbpId: p.hrbpId ?? null,
    status: p.status === "inactive" ? "inactive" : "active",
  };
}

export function byId<T extends { id: number }>(people: T[]): Map<number, T> {
  return new Map(people.map((p) => [p.id, p]));
}

/**
 * Walk through inactive managers so FMLA / leave does not orphan the tree.
 * Returns the nearest active ancestor, or null.
 */
export function effectiveManagerId(
  person: ScopePerson,
  peopleById: Map<number, ScopePerson>,
  includeInactive: boolean,
): number | null {
  const seen = new Set<number>();
  let current: number | null = person.managerId;
  while (current != null && !seen.has(current)) {
    seen.add(current);
    const manager = peopleById.get(current);
    if (!manager) return null;
    if (includeInactive || manager.status === "active") return manager.id;
    current = manager.managerId;
  }
  return null;
}

/** Full reporting subtree including the root. */
export function collectSubtree(
  rootId: number,
  people: ScopePerson[],
  peopleById: Map<number, ScopePerson>,
  includeInactive: boolean,
): Set<number> {
  const children = new Map<number, number[]>();
  for (const p of people) {
    if (!includeInactive && p.status !== "active" && p.id !== rootId) continue;
    const mid = effectiveManagerId(p, peopleById, includeInactive);
    if (mid == null) continue;
    const list = children.get(mid) ?? [];
    list.push(p.id);
    children.set(mid, list);
  }

  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return out;
}

/** Ancestors from a person up to the root, excluding the person. */
export function collectAncestors(
  personId: number,
  peopleById: Map<number, ScopePerson>,
  includeInactive: boolean,
): number[] {
  const person = peopleById.get(personId);
  if (!person) return [];
  const out: number[] = [];
  const seen = new Set<number>([personId]);
  let current = effectiveManagerId(person, peopleById, includeInactive);
  while (current != null && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    const node = peopleById.get(current);
    if (!node) break;
    current = effectiveManagerId(node, peopleById, includeInactive);
  }
  return out;
}

/**
 * People in focus for the current lens. Inactive people are omitted unless
 * `includeInactive` is set. Does not include muted org-chart ancestors.
 */
export function inFocusIds(
  people: ScopePerson[],
  scope: ScopeQuery,
  viewer: ScopeViewer,
): Set<number> {
  const peopleById = byId(people);
  const visible = (p: ScopePerson) => scope.includeInactive || p.status === "active";
  const activePeople = people.filter(visible);

  switch (scope.lens) {
    case "all":
      return new Set(activePeople.map((p) => p.id));

    case "departments": {
      const wanted = new Set(scope.departmentIds);
      if (wanted.size === 0) return new Set();
      return new Set(
        activePeople.filter((p) => p.departmentId != null && wanted.has(p.departmentId)).map((p) => p.id),
      );
    }

    case "leader": {
      if (scope.leaderId == null) return new Set();
      const root = peopleById.get(scope.leaderId);
      if (!root || !visible(root)) return new Set();
      return collectSubtree(scope.leaderId, people, peopleById, scope.includeInactive);
    }

    case "hrbp": {
      const hrbpId = scope.hrbpId;
      if (hrbpId == null) return new Set();
      return new Set(activePeople.filter((p) => p.hrbpId === hrbpId).map((p) => p.id));
    }

    case "my_team":
    default: {
      if (viewer.personId != null && viewer.isHrbp) {
        return new Set(activePeople.filter((p) => p.hrbpId === viewer.personId).map((p) => p.id));
      }
      if (viewer.personId != null) {
        return collectSubtree(viewer.personId, people, peopleById, scope.includeInactive);
      }
      // Admin / unmatched login: empty My team (UI should offer Everyone).
      return new Set();
    }
  }
}

/**
 * Org-chart node set: in-focus people plus ancestors needed to keep the tree
 * connected. Ancestors that are not in focus should be rendered muted.
 */
export function orgChartNodeIds(
  people: ScopePerson[],
  scope: ScopeQuery,
  viewer: ScopeViewer,
): { focus: Set<number>; muted: Set<number> } {
  const focus = inFocusIds(people, scope, viewer);
  const peopleById = byId(people);
  const muted = new Set<number>();
  for (const id of focus) {
    for (const ancestorId of collectAncestors(id, peopleById, scope.includeInactive)) {
      if (!focus.has(ancestorId)) muted.add(ancestorId);
    }
  }
  return { focus, muted };
}

export function effectiveScope(scope: ScopeQuery, viewer: ScopeViewer): ScopeQuery {
  if (scope.lens === "my_team" && viewer.personId == null && viewer.appRole === "admin") {
    return { ...scope, lens: "all" };
  }
  return scope;
}

export function eventTouchesScope(
  participantIds: number[],
  focus: Set<number>,
): boolean {
  return participantIds.some((id) => focus.has(id));
}
