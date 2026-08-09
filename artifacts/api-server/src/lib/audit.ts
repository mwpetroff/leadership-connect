/**
 * Fire-and-forget audit log helper.
 *
 * Writes a record to the audit_log table without blocking the request.
 * All errors — including synchronous ones thrown while building the query —
 * are caught so a logging failure never breaks a mutation or leaks an
 * unhandled rejection into the test runner.
 */
import type { Request } from "express";
import { db, auditLogTable } from "@workspace/db";

export type AuditAction = "create" | "update" | "delete";

export function logAudit(
  req: Request,
  action: AuditAction,
  resourceType: string,
  resourceId: string | number,
  before: unknown | null,
  after: unknown | null,
): void {
  const actor = req.user;
  if (!actor) return; // dev-bypass may have no user — skip silently

  // Fire-and-forget: spawn a micro-task and catch ALL errors (sync + async)
  // so callers are never blocked and the test runner never sees an unhandled
  // rejection from a mock that doesn't implement the full DB interface.
  void (async () => {
    try {
      await db.insert(auditLogTable).values({
        actorId: actor.id,
        actorName: actor.name,
        action,
        resourceType,
        resourceId: String(resourceId),
        before: before ?? null,
        after: after ?? null,
      });
    } catch (err) {
      // Audit log failure must never propagate — log to stderr only.
      console.error("[audit] Failed to write audit log entry:", err);
    }
  })();
}
