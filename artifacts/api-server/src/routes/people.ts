import { Router, type IRouter, type RequestHandler } from "express";
import express from "express";
import { eq, ilike, or, and, desc, inArray, sql } from "drizzle-orm";
import { db, peopleTable, invitationsTable, virtualMeetingParticipantsTable, virtualMeetingsTable, eventsTable } from "@workspace/db";
import {
  ListPeopleQueryParams,
  CreatePersonBody,
  GetPersonParams,
  UpdatePersonParams,
  UpdatePersonBody,
  DeletePersonParams,
  GetPersonEngagementParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { geocodeCity } from "../lib/geocoding";

// ── CSV helpers ────────────────────────────────────────────────────────────────

const VALID_ROLES = new Set(["executive", "secondary_leader", "staff"]);

/**
 * Stateful CSV parser. Processes the entire document character-by-character so
 * that quoted fields containing embedded commas, newlines, or escaped quotes
 * ("") are handled correctly. Returns an array of objects keyed by the header
 * row. Logical row numbers start at 1 (header = row 1, first data row = row 2).
 */
export function parseCSV(text: string): Array<Record<string, string>> {
  // Normalise CRLF / CR to LF so we only deal with one newline style.
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const logicalRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          // Escaped double-quote inside a quoted field ("" → ")
          currentField += '"';
          i++;
        } else {
          // Closing quote — exit quoted mode
          inQuotes = false;
        }
      } else {
        // Everything inside quotes is literal, including \n
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((f) => f.trim() !== "")) {
          logicalRows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += ch;
      }
    }
  }

  // Flush the final field / row (file may not end with a newline)
  currentRow.push(currentField);
  if (currentRow.some((f) => f.trim() !== "")) {
    logicalRows.push(currentRow);
  }

  if (logicalRows.length < 2) return [];

  const headers = logicalRows[0].map((h) => h.trim().toLowerCase());

  return logicalRows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] ?? "").trim();
    });
    return record;
  });
}

// Column aliases so exports from Workday / BambooHR map naturally.
// "first name" is intentionally NOT aliased to "name" — mapping only the first
// name while silently ignoring "last name" would corrupt records. Files with
// separate first/last columns are detected below and rejected with a clear
// per-row reason.
const COL_ALIASES: Record<string, string> = {
  "full name": "name",
  "employee name": "name",
  "work email": "email",
  "email address": "email",
  "job title": "title",
  "position": "title",
  "dept": "department",
  "home city": "homecity",
  "city": "homecity",
  "home state": "homestate",
  "state": "homestate",
};

function normalizeKey(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return COL_ALIASES[lower] ?? lower.replace(/[\s_-]+/g, "");
}

const router: IRouter = Router();

router.get("/people", async (req, res): Promise<void> => {
  const parsed = ListPeopleQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, search } = parsed.data;

  const conditions: ReturnType<typeof eq>[] = [];
  if (role) conditions.push(eq(peopleTable.role, role));

  let query = db.select().from(peopleTable);
  let results;

  if (search) {
    const searchLike = `%${search}%`;
    if (conditions.length > 0) {
      results = await query
        .where(and(...conditions, or(ilike(peopleTable.name, searchLike), ilike(peopleTable.email, searchLike), ilike(peopleTable.department, searchLike))))
        .orderBy(peopleTable.name);
    } else {
      results = await query
        .where(or(ilike(peopleTable.name, searchLike), ilike(peopleTable.email, searchLike), ilike(peopleTable.department, searchLike)))
        .orderBy(peopleTable.name);
    }
  } else if (conditions.length > 0) {
    results = await query.where(and(...conditions)).orderBy(peopleTable.name);
  } else {
    results = await query.orderBy(peopleTable.name);
  }

  res.json(results);
});

router.post("/people", async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const coords = await geocodeCity(parsed.data.homeCity, parsed.data.homeState);
  const [person] = await db
    .insert(peopleTable)
    .values({ ...parsed.data, lat: coords?.lat ?? null, lng: coords?.lng ?? null, geocodedAt: new Date() })
    .returning();
  logAudit(req, "create", "person", person.id, null, person);
  res.status(201).json(person);
});

router.get("/people/:id", async (req, res): Promise<void> => {
  const params = GetPersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));
  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  res.json(person);
});

router.patch("/people/:id", async (req, res): Promise<void> => {
  const params = UpdatePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));

  // Re-geocode only when city or state actually changes
  const cityChanged = parsed.data.homeCity !== undefined && parsed.data.homeCity !== before?.homeCity;
  const stateChanged = parsed.data.homeState !== undefined && parsed.data.homeState !== before?.homeState;

  let coordUpdate: { lat?: number | null; lng?: number | null; geocodedAt?: Date } = {};
  if (cityChanged || stateChanged) {
    const city = parsed.data.homeCity ?? before?.homeCity;
    const state = parsed.data.homeState ?? before?.homeState;
    const coords = await geocodeCity(city, state);
    coordUpdate = { lat: coords?.lat ?? null, lng: coords?.lng ?? null, geocodedAt: new Date() };
  }

  const [person] = await db
    .update(peopleTable)
    .set({ ...parsed.data, ...coordUpdate })
    .where(eq(peopleTable.id, params.data.id))
    .returning();

  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  logAudit(req, "update", "person", person.id, before ?? null, person);
  res.json(person);
});

// ── POST /people/import ───────────────────────────────────────────────────────

// Max import payload: 10 MB (≈ 100,000+ rows @ ~100 bytes/row).
// Applied as route-specific middleware so the global express.json() 100 KB
// cap never runs for this endpoint (text/plain bypasses it entirely).
const csvBodyParser: RequestHandler = express.text({ limit: "10mb", type: "text/plain" });

// Column count for one inserted row (name, email, role, title, department,
// homeCity, homeState, lat, lng). Used to stay within PostgreSQL's 65,535
// bind-parameter limit. 500 × 9 = 4,500 params per chunk — very conservative.
const UPSERT_CHUNK_SIZE = 500;

router.post("/people/import", csvBodyParser, async (req, res): Promise<void> => {
  const csv = typeof req.body === "string" ? req.body : "";
  if (csv.trim() === "") {
    res.status(400).json({ error: "Request body must be a non-empty CSV (Content-Type: text/plain)." });
    return;
  }

  // Parse CSV
  const rawRows = parseCSV(csv);
  if (rawRows.length === 0) {
    res.status(400).json({ error: "CSV has no data rows (only a header or is empty)." });
    return;
  }

  // Normalize keys
  const rows = rawRows.map((r) => {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      normalized[normalizeKey(k)] = v;
    }
    return normalized;
  });

  // Validate each row
  interface ValidRow {
    name: string;
    email: string;
    role: "executive" | "secondary_leader" | "staff";
    title: string | null;
    department: string | null;
    homeCity: string;
    homeState: string;
  }
  interface SkippedRow {
    row: number;
    email: string;
    reason: string;
  }

  // Detect separate first/last name columns before row-level validation.
  // If the file has "firstname" or "lastname" (normalized) but no "name" column,
  // every row would silently drop the last name. Reject with a clear message instead.
  const hasSeparateNames =
    rows.length > 0 &&
    Object.prototype.hasOwnProperty.call(rows[0], "firstname") &&
    !Object.prototype.hasOwnProperty.call(rows[0], "name");

  const validRows: ValidRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // 1-based, accounting for header row
    const email = (r["email"] ?? "").trim().toLowerCase();
    const name = (r["name"] ?? "").trim();

    if (hasSeparateNames) {
      skipped.push({
        row: rowNum,
        email: email || "(none)",
        reason:
          "File has separate 'first name'/'last name' columns — combine them into a single 'name' column and re-upload",
      });
      continue;
    }
    if (!name) {
      skipped.push({ row: rowNum, email: email || "(none)", reason: "Missing required field: name" });
      continue;
    }
    if (!email || !email.includes("@")) {
      skipped.push({ row: rowNum, email: email || "(none)", reason: "Missing or invalid email address" });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ row: rowNum, email, reason: "Duplicate email within the uploaded file (first occurrence wins)" });
      continue;
    }
    seenEmails.add(email);

    const rawRole = (r["role"] ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const role = VALID_ROLES.has(rawRole)
      ? (rawRole as ValidRow["role"])
      : "staff";

    validRows.push({
      name,
      email,
      role,
      title: r["title"]?.trim() || null,
      department: r["department"]?.trim() || null,
      homeCity: r["homecity"]?.trim() || "",
      homeState: r["homestate"]?.trim() || "",
    });
  }

  if (validRows.length === 0) {
    res.json({ created: 0, updated: 0, skipped });
    return;
  }

  // ── Chunk helper ────────────────────────────────────────────────────────
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // ── Determine which emails already exist (chunked inArray) ───────────────
  // PostgreSQL also has a practical limit on IN list size; 500 emails per
  // query is conservative and avoids any per-statement parameter ceiling.
  const emails = validRows.map((r) => r.email);
  const existingRows: { email: string }[] = [];
  for (const emailChunk of chunk(emails, UPSERT_CHUNK_SIZE)) {
    const rows = await db
      .select({ email: peopleTable.email })
      .from(peopleTable)
      .where(inArray(peopleTable.email, emailChunk));
    existingRows.push(...rows);
  }
  const existingEmails = new Set(existingRows.map((e) => e.email.toLowerCase()));

  const createdCount = validRows.filter((r) => !existingEmails.has(r.email)).length;
  const updatedCount = validRows.filter((r) => existingEmails.has(r.email)).length;

  // ── Chunked upsert — stays well within PostgreSQL's 65,535 param limit ──
  const insertValues = validRows.map((r) => ({
    name: r.name,
    email: r.email,
    role: r.role,
    title: r.title,
    department: r.department,
    homeCity: r.homeCity,
    homeState: r.homeState,
    lat: null as number | null,
    lng: null as number | null,
    // geocodedAt stays null so the existing backfill picks up new rows
  }));

  for (const rowChunk of chunk(insertValues, UPSERT_CHUNK_SIZE)) {
    await db
      .insert(peopleTable)
      .values(rowChunk)
      .onConflictDoUpdate({
        target: peopleTable.email,
        set: {
          name: sql`excluded.name`,
          role: sql`excluded.role`,
          title: sql`excluded.title`,
          department: sql`excluded.department`,
          homeCity: sql`excluded.home_city`,
          homeState: sql`excluded.home_state`,
          // Only reset coordinates when the location actually changes.
          // If city/state are unchanged, preserve existing coords so the map
          // is not regressed by non-location updates (title, role, dept…).
          lat: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.lat END`,
          lng: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.lng END`,
          geocodedAt: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.geocoded_at END`,
          updatedAt: sql`now()`,
        },
      });
  }

  // Single audit entry for the whole import
  const beforeCount = (await db.select({ id: peopleTable.id }).from(peopleTable)).length;
  logAudit(req, "create", "bulk_import", "people", null, {
    created: createdCount,
    updated: updatedCount,
    skipped: skipped.length,
    totalAfter: beforeCount,
  });

  res.json({ created: createdCount, updated: updatedCount, skipped });
});

router.delete("/people/:id", async (req, res): Promise<void> => {
  const params = DeletePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db
    .delete(peopleTable)
    .where(eq(peopleTable.id, params.data.id))
    .returning();

  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  logAudit(req, "delete", "person", person.id, person, null);
  res.sendStatus(204);
});

router.get("/people/:id/engagement", async (req, res): Promise<void> => {
  const params = GetPersonEngagementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [person] = await db.select().from(peopleTable).where(eq(peopleTable.id, params.data.id));
  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  // Get invitations with event data
  const invitations = await db
    .select({
      id: invitationsTable.id,
      eventId: invitationsTable.eventId,
      personId: invitationsTable.personId,
      status: invitationsTable.status,
      notes: invitationsTable.notes,
      createdAt: invitationsTable.createdAt,
      updatedAt: invitationsTable.updatedAt,
      event: {
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        location: eventsTable.location,
        city: eventsTable.city,
        state: eventsTable.state,
        startDate: eventsTable.startDate,
        endDate: eventsTable.endDate,
        eventType: eventsTable.eventType,
        createdAt: eventsTable.createdAt,
      },
    })
    .from(invitationsTable)
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.personId, params.data.id))
    .orderBy(desc(eventsTable.startDate));

  // Get virtual meetings
  const participations = await db
    .select({ meetingId: virtualMeetingParticipantsTable.meetingId })
    .from(virtualMeetingParticipantsTable)
    .where(eq(virtualMeetingParticipantsTable.personId, params.data.id));

  const meetingIds = participations.map((p) => p.meetingId);
  let virtualMeetings: typeof virtualMeetingsTable.$inferSelect[] = [];
  if (meetingIds.length > 0) {
    virtualMeetings = await db
      .select()
      .from(virtualMeetingsTable)
      .where(
        meetingIds.length === 1
          ? eq(virtualMeetingsTable.id, meetingIds[0])
          : undefined
      )
      .orderBy(desc(virtualMeetingsTable.scheduledDate));
    // Fallback: filter client-side if needed
    if (meetingIds.length > 1) {
      const all = await db.select().from(virtualMeetingsTable).orderBy(desc(virtualMeetingsTable.scheduledDate));
      virtualMeetings = all.filter((m) => meetingIds.includes(m.id));
    }
  }

  // Calculate days since last touchpoint
  const allDates: Date[] = [];
  for (const inv of invitations) {
    if (inv.status === "attended") allDates.push(new Date(inv.event.startDate));
  }
  for (const vm of virtualMeetings) {
    if (vm.status === "completed" && vm.scheduledDate) allDates.push(new Date(vm.scheduledDate));
  }

  const daysSinceLastTouchpoint = allDates.length > 0
    ? Math.floor((Date.now() - Math.max(...allDates.map((d) => d.getTime()))) / (1000 * 60 * 60 * 24))
    : null;

  const totalInPersonAttended = invitations.filter((i) => i.status === "attended").length;
  const totalVirtualCompleted = virtualMeetings.filter((m) => m.status === "completed").length;

  res.json({
    person,
    invitations: invitations.map((inv) => ({
      ...inv,
      person,
    })),
    virtualMeetings: virtualMeetings.map((vm) => ({
      ...vm,
      participantCount: 0,
    })),
    daysSinceLastTouchpoint,
    totalInPersonAttended,
    totalVirtualCompleted,
  });
});

export default router;
