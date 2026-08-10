import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, officesTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

const officeBodySchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

// ── GET /offices ───────────────────────────────────────────────────────────────

router.get("/offices", async (_req, res): Promise<void> => {
  const offices = await db.select().from(officesTable).orderBy(officesTable.name);
  res.json(offices);
});

// ── POST /offices ──────────────────────────────────────────────────────────────

router.post("/offices", async (req, res): Promise<void> => {
  const parsed = officeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid office data", details: parsed.error.flatten() });
    return;
  }

  const { name, city, state, lat, lng } = parsed.data;

  const [created] = await db
    .insert(officesTable)
    .values({ name, city, state, lat: lat ?? null, lng: lng ?? null })
    .returning();

  logAudit(req, "create", "office", created.id, null, created);
  res.status(201).json(created);
});

// ── PATCH /offices/:id ─────────────────────────────────────────────────────────

router.patch("/offices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = officeBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid office data", details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db.select().from(officesTable).where(eq(officesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Office not found" });
    return;
  }

  const updates: Partial<typeof existing> = {};
  const data = parsed.data;
  if (data.name !== undefined) updates.name = data.name;
  if (data.city !== undefined) updates.city = data.city;
  if (data.state !== undefined) updates.state = data.state;
  if (data.lat !== undefined) updates.lat = data.lat ?? null;
  if (data.lng !== undefined) updates.lng = data.lng ?? null;

  const [updated] = await db
    .update(officesTable)
    .set(updates)
    .where(eq(officesTable.id, id))
    .returning();

  logAudit(req, "update", "office", id, existing, updated);
  res.json(updated);
});

// ── DELETE /offices/:id ────────────────────────────────────────────────────────

router.delete("/offices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db.select().from(officesTable).where(eq(officesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Office not found" });
    return;
  }

  await db.delete(officesTable).where(eq(officesTable.id, id));
  logAudit(req, "delete", "office", id, existing, null);
  res.status(204).send();
});

export default router;
