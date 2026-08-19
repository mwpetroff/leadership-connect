import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db, peopleTable } from "@workspace/db";
import type { ScopeViewer } from "./scope";
import type { SessionUser } from "./auth";

export async function resolveViewer(req: Request): Promise<ScopeViewer> {
  const user = req.user as SessionUser | undefined;
  if (!user) {
    return { personId: null, isHrbp: false, appRole: "staff" };
  }

  const email = user.email.toLowerCase();
  const rows = await db
    .select({ id: peopleTable.id, isHrbp: peopleTable.isHrbp, email: peopleTable.email })
    .from(peopleTable)
    .where(sql`lower(${peopleTable.email}) = ${email}`);

  const person = rows.find((p) => typeof p.email === "string" && p.email.toLowerCase() === email) ?? null;

  return {
    personId: person?.id ?? null,
    isHrbp: person?.isHrbp ?? user.role === "hrbp",
    appRole: user.role,
  };
}

export function enrichAuthUser(user: SessionUser, viewer: ScopeViewer) {
  return {
    ...user,
    personId: viewer.personId,
    isHrbp: viewer.isHrbp,
  };
}
