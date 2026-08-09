import { Router, type IRouter } from "express";
import { desc, eq, and } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

// ── GET /audit-log ─────────────────────────────────────────────────────────────
// Admin-only. Returns paginated audit log entries, newest first.
// Query params: page, limit, resourceType, actorId

router.get("/audit-log", requireRole("admin"), async (req, res): Promise<void> => {
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 25);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? Math.floor(rawLimit) : 25;
  const resourceType = typeof req.query.resourceType === "string" ? req.query.resourceType : undefined;
  const actorId = typeof req.query.actorId === "string" ? req.query.actorId : undefined;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (resourceType) conditions.push(eq(auditLogTable.resourceType, resourceType));
  if (actorId) conditions.push(eq(auditLogTable.actorId, actorId));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(auditLogTable)
          .where(and(...conditions))
          .orderBy(desc(auditLogTable.createdAt))
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(auditLogTable)
          .orderBy(desc(auditLogTable.createdAt))
          .limit(limit)
          .offset(offset);

  // Total count for pagination metadata — apply the same filters so page counts are accurate.
  const total = conditions.length > 0
    ? await db.$count(auditLogTable, and(...conditions))
    : await db.$count(auditLogTable);

  res.json({
    items: rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

export default router;
