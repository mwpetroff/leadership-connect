import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { seedDefaults, DEFAULTS } from "../lib/settings-store";
import { logAudit } from "../lib/audit";
const router: IRouter = Router();

// ── GET /settings ──────────────────────────────────────────────────────────────
// Returns all settings rows (with defaults seeded on first access).

router.get("/settings", async (_req, res): Promise<void> => {
  await seedDefaults();
  const rows = await db.select().from(settingsTable).orderBy(settingsTable.key);
  res.json(rows);
});

// ── PATCH /settings/:key ───────────────────────────────────────────────────────
// Updates a single setting value. Only known keys (those with defaults) are accepted.

router.patch("/settings/:key", async (req, res): Promise<void> => {
  const key = req.params.key;
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "Invalid key" });
    return;
  }

  const { value } = req.body as { value?: unknown };
  if (typeof value !== "string") {
    res.status(400).json({ error: "value must be a string" });
    return;
  }

  // Only allow known keys
  if (!(key in DEFAULTS)) {
    res.status(404).json({ error: `Unknown setting: ${key}` });
    return;
  }

  // Read current value for audit
  const [current] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  const before = current ?? null;

  const [updated] = await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();

  logAudit(req, "update", "setting", key, before, updated);

  res.json(updated);
});

export default router;
