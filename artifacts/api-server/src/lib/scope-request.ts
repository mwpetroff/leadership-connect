import type { Request } from "express";
import { db, peopleTable } from "@workspace/db";
import {
  parseScopeQuery,
  effectiveScope,
  inFocusIds,
  asScopePerson,
  type ScopePerson,
  type ScopeQuery,
  type ScopeViewer,
} from "./scope";
import { resolveViewer } from "./viewer";

export async function resolveRequestFocus(
  req: Request,
  people?: ScopePerson[],
): Promise<{
  viewer: ScopeViewer;
  scope: ScopeQuery;
  focus: Set<number>;
  people: ScopePerson[];
}> {
  const viewer = await resolveViewer(req);
  const scope = effectiveScope(parseScopeQuery(req.query as Record<string, unknown>), viewer);
  const rows =
    people ??
    (
      await db
        .select({
          id: peopleTable.id,
          managerId: peopleTable.managerId,
          departmentId: peopleTable.departmentId,
          hrbpId: peopleTable.hrbpId,
          status: peopleTable.status,
        })
        .from(peopleTable)
    ).map(asScopePerson);
  return { viewer, scope, focus: inFocusIds(rows, scope, viewer), people: rows };
}
