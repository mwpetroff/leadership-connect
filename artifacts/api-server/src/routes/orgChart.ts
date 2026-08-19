import { Router, type IRouter } from "express";
import { db, peopleTable } from "@workspace/db";
import {
  parseScopeQuery,
  effectiveScope,
  orgChartNodeIds,
  effectiveManagerId,
  type ScopePerson,
} from "../lib/scope";
import { resolveViewer } from "../lib/viewer";

const router: IRouter = Router();

export interface OrgNode {
  id: number;
  name: string;
  title: string | null;
  role: string;
  department: string | null;
  homeCity: string;
  homeState: string;
  email: string;
  managerId: number | null;
  hrbpId: number | null;
  hrbpName: string | null;
  isHrbp: boolean;
  status: string;
  muted: boolean;
  children: OrgNode[];
}

router.get("/org-chart", async (req, res): Promise<void> => {
  const people = await db.select().from(peopleTable).orderBy(peopleTable.name);
  const viewer = await resolveViewer(req);
  const scope = effectiveScope(parseScopeQuery(req.query as Record<string, unknown>), viewer);

  const scopePeople: ScopePerson[] = people.map((p) => ({
    id: p.id,
    managerId: p.managerId,
    departmentId: p.departmentId,
    hrbpId: p.hrbpId,
    status: p.status ?? "active",
  }));
  const peopleById = new Map(scopePeople.map((p) => [p.id, p]));
  const { focus, muted } = orgChartNodeIds(people, scope, viewer);
  const visible = new Set([...focus, ...muted]);

  const hrbpNameById = new Map(
    people.filter((p) => p.isHrbp).map((p) => [p.id, p.name]),
  );

  const nodeMap = new Map<number, OrgNode>();
  for (const p of people) {
    if (!visible.has(p.id)) continue;
    nodeMap.set(p.id, {
      id: p.id,
      name: p.name,
      title: p.title,
      role: p.role,
      department: null,
      homeCity: p.homeCity,
      homeState: p.homeState,
      email: p.email,
      managerId: effectiveManagerId(
        { id: p.id, managerId: p.managerId, departmentId: p.departmentId, hrbpId: p.hrbpId, status: p.status ?? "active" },
        peopleById,
        scope.includeInactive,
      ),
      hrbpId: p.hrbpId,
      hrbpName: p.hrbpId != null ? (hrbpNameById.get(p.hrbpId) ?? null) : null,
      isHrbp: p.isHrbp ?? false,
      status: p.status ?? "active",
      muted: muted.has(p.id),
      children: [],
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.managerId && nodeMap.has(node.managerId)) {
      nodeMap.get(node.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: OrgNode[]): void => {
    nodes.sort((a, b) => Number(a.muted) - Number(b.muted) || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  res.json({
    nodes: roots,
    total: focus.size,
    mutedCount: muted.size,
  });
});

export default router;
