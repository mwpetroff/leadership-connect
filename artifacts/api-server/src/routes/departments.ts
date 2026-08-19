import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, departmentsTable, peopleTable } from "@workspace/db";
import { z } from "zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const CreateBody = z.object({
  name: z.string().min(1),
  parentId: z.number().int().positive().nullable().optional(),
  leadershipOneOnOneDays: z.number().int().positive().nullable().optional(),
  skipLevelDays: z.number().int().positive().nullable().optional(),
});

const UpdateBody = CreateBody.partial();

function toDto(row: typeof departmentsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    leadershipOneOnOneDays: row.leadershipOneOnOneDays,
    skipLevelDays: row.skipLevelDays,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/departments", async (_req, res): Promise<void> => {
  const rows = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  res.json(rows.map(toDto));
});

router.post("/departments", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  const [dup] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(ilike(departmentsTable.name, name));
  if (dup) {
    res.status(409).json({ error: `Department "${name}" already exists` });
    return;
  }

  const [row] = await db
    .insert(departmentsTable)
    .values({
      name,
      parentId: parsed.data.parentId ?? null,
      leadershipOneOnOneDays: parsed.data.leadershipOneOnOneDays ?? null,
      skipLevelDays: parsed.data.skipLevelDays ?? null,
    })
    .returning();

  logAudit(req, "create", "department", row.id, null, row);
  res.status(201).json(toDto(row));
});

router.patch("/departments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid department id" });
    return;
  }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id));
  if (!before) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  if (parsed.data.parentId === id) {
    res.status(400).json({ error: "A department cannot be its own parent" });
    return;
  }

  const [row] = await db
    .update(departmentsTable)
    .set({
      ...(parsed.data.name != null ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
      ...(parsed.data.leadershipOneOnOneDays !== undefined
        ? { leadershipOneOnOneDays: parsed.data.leadershipOneOnOneDays }
        : {}),
      ...(parsed.data.skipLevelDays !== undefined ? { skipLevelDays: parsed.data.skipLevelDays } : {}),
    })
    .where(eq(departmentsTable.id, id))
    .returning();

  logAudit(req, "update", "department", id, before, row);
  res.json(toDto(row));
});

router.delete("/departments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid department id" });
    return;
  }

  const [assigned] = await db
    .select({ id: peopleTable.id })
    .from(peopleTable)
    .where(eq(peopleTable.departmentId, id))
    .limit(1);
  if (assigned) {
    res.status(409).json({
      error: "Department still has people assigned. Move them first, then delete.",
    });
    return;
  }

  const [before] = await db.delete(departmentsTable).where(eq(departmentsTable.id, id)).returning();
  if (!before) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  logAudit(req, "delete", "department", id, before, null);
  res.sendStatus(204);
});

export default router;
