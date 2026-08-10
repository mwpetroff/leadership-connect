import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, peopleTable } from "@workspace/db";

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
  children: OrgNode[];
}

router.get("/org-chart", async (_req, res): Promise<void> => {
  const people = await db
    .select({
      id: peopleTable.id,
      name: peopleTable.name,
      title: peopleTable.title,
      role: peopleTable.role,
      department: peopleTable.department,
      homeCity: peopleTable.homeCity,
      homeState: peopleTable.homeState,
      email: peopleTable.email,
      managerId: peopleTable.managerId,
    })
    .from(peopleTable)
    .orderBy(peopleTable.name);

  // Build adjacency map
  const nodeMap = new Map<number, OrgNode>(
    people.map((p) => [p.id, { ...p, children: [] }])
  );

  const roots: OrgNode[] = [];

  for (const node of nodeMap.values()) {
    if (node.managerId && nodeMap.has(node.managerId)) {
      nodeMap.get(node.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically at each level
  const sortChildren = (nodes: OrgNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);

  res.json({ nodes: roots, total: people.length });
});

export default router;
