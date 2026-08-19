import { Router, type IRouter, type RequestHandler } from "express";
import express from "express";
import { eq, ilike, desc, inArray, sql, isNotNull } from "drizzle-orm";
import { db, peopleTable, invitationsTable, virtualMeetingParticipantsTable, virtualMeetingsTable, eventsTable, departmentsTable } from "@workspace/db";
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
import { haversineMiles } from "../lib/geo";
import { getSetting } from "../lib/settings-store";
import { parseScopeQuery, inFocusIds, effectiveScope, type ScopePerson } from "../lib/scope";
import { resolveViewer } from "../lib/viewer";
import { toPersonDto } from "../lib/person-dto";
import { loadCoverageSnapshot } from "../lib/coverage-data";
import { GAP_LABELS, type GapKind } from "../lib/coverage";
import {
  detectHeaders,
  normalizeImportKey,
  validateImportRows,
  wouldCreateManagerCycle,
} from "../lib/import-people";

// ── CSV helpers ────────────────────────────────────────────────────────────────


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
function mapPersonRow(row: Record<string, unknown>) {
  const person = (row.person ?? row) as Parameters<typeof toPersonDto>[0];
  return toPersonDto(person, {
    department: (row.departmentName as string | null | undefined) ?? (person as { department?: string | null }).department,
    managerName: (row.managerName as string | null | undefined) ?? null,
    hrbpName: (row.hrbpName as string | null | undefined) ?? null,
  });
}

async function resolveDepartmentId(input: {
  departmentId?: number | null;
  department?: string | null;
}): Promise<{ id: number | null; error?: string }> {
  if (input.departmentId != null) {
    const [row] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, input.departmentId));
    if (!row) return { id: null, error: "Unknown departmentId" };
    return { id: row.id };
  }
  const name = input.department?.trim();
  if (!name) return { id: null };
  const [row] = await db.select().from(departmentsTable).where(ilike(departmentsTable.name, name));
  if (!row) return { id: null, error: `Unknown department "${name}" — HR must create it first` };
  return { id: row.id };
}

const router: IRouter = Router();

router.get("/people", async (req, res): Promise<void> => {
  const parsed = ListPeopleQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, search } = parsed.data;
  const viewer = await resolveViewer(req);
  const scope = effectiveScope(parseScopeQuery(req.query as Record<string, unknown>), viewer);
  const statusFilter = String((req.query as Record<string, unknown>).status ?? "");

  const people = await db.select().from(peopleTable).orderBy(peopleTable.name);
  const depts = await db.select().from(departmentsTable);
  const deptById = new Map(
    depts
      .filter((d) => typeof d.id === "number" && typeof (d as { name?: string }).name === "string")
      .map((d) => [d.id, (d as { name: string }).name]),
  );
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const mapped = people.map((p) =>
    toPersonDto(p, {
      department:
        p.departmentId != null ? (deptById.get(p.departmentId) ?? null) : (p as { department?: string | null }).department,
      managerName: p.managerId != null ? (nameById.get(p.managerId) ?? null) : null,
      hrbpName: p.hrbpId != null ? (nameById.get(p.hrbpId) ?? null) : null,
    }),
  );
  const scopePeople: ScopePerson[] = mapped.map((p) => ({
    id: p.id,
    managerId: p.managerId,
    departmentId: p.departmentId,
    hrbpId: p.hrbpId,
    status: p.status === "inactive" ? "inactive" : "active",
  }));

  const focus = inFocusIds(scopePeople, scope, viewer);

  let results = mapped.filter((p) => focus.has(p.id));
  if (role) results = results.filter((p) => p.role === role);
  if (statusFilter === "inactive") {
    results = mapped.filter((p) => p.status === "inactive");
  } else if (statusFilter === "active") {
    results = results.filter((p) => p.status === "active");
  }
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q) ||
        (p.title ?? "").toLowerCase().includes(q),
    );
  }

  res.json(results);
});

router.post("/people", async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const dept = await resolveDepartmentId({
    departmentId: typeof body.departmentId === "number" ? body.departmentId : undefined,
    department: parsed.data.department,
  });
  if (dept.error) {
    res.status(400).json({ error: dept.error });
    return;
  }

  const coords = await geocodeCity(parsed.data.homeCity, parsed.data.homeState);
  const [person] = await db
    .insert(peopleTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email.trim().toLowerCase(),
      role: parsed.data.role,
      title: parsed.data.title ?? null,
      homeCity: parsed.data.homeCity,
      homeState: parsed.data.homeState,
      notes: parsed.data.notes ?? null,
      managerId: parsed.data.managerId ?? null,
      departmentId: dept.id,
      hrbpId: typeof body.hrbpId === "number" ? body.hrbpId : null,
      isHrbp: body.isHrbp === true,
      status: body.status === "inactive" ? "inactive" : "active",
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      geocodedAt: new Date(),
    })
    .returning();
  logAudit(req, "create", "person", person.id, null, person);
  res.status(201).json(toPersonDto(person));
});

// ── GET /people/export ────────────────────────────────────────────────────────
// Streams the full people table as a CSV.  Must be registered before
// GET /people/:id so Express doesn't swallow "export" as a route param.

router.get("/people/export", async (req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="people-export.csv"');
  res.setHeader("Cache-Control", "no-store");

  const HEADERS = [
    "name",
    "email",
    "role",
    "title",
    "department",
    "managerEmail",
    "hrbpEmail",
    "isHrbp",
    "homeCity",
    "homeState",
    "status",
  ];

  function escapeField(value: string | null | undefined): string {
    const s = value ?? "";
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  res.write(HEADERS.join(",") + "\n");

  const people = await db.select().from(peopleTable).orderBy(peopleTable.name);
  const depts = await db.select().from(departmentsTable);
  const deptById = new Map(
    depts
      .filter((d) => typeof d.id === "number" && typeof (d as { name?: string }).name === "string")
      .map((d) => [d.id, (d as { name: string }).name]),
  );
  const emailById = new Map(people.map((p) => [p.id, p.email]));

  for (const row of people) {
    const line = [
      escapeField(row.name),
      escapeField(row.email),
      escapeField(row.role),
      escapeField(row.title),
      escapeField(row.departmentId != null ? (deptById.get(row.departmentId) ?? "") : ""),
      escapeField(row.managerId != null ? (emailById.get(row.managerId) ?? "") : ""),
      escapeField(row.hrbpId != null ? (emailById.get(row.hrbpId) ?? "") : ""),
      escapeField(row.isHrbp ? "true" : "false"),
      escapeField(row.homeCity),
      escapeField(row.homeState),
      escapeField(row.status ?? "active"),
    ].join(",");
    res.write(line + "\n");
  }

  res.end();
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

  res.json(mapPersonRow(person as unknown as Record<string, unknown>));
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

  const body = req.body as Record<string, unknown>;
  let departmentId = before?.departmentId ?? null;
  if (body.departmentId !== undefined || parsed.data.department !== undefined) {
    const dept = await resolveDepartmentId({
      departmentId: typeof body.departmentId === "number" ? body.departmentId : body.departmentId === null ? null : undefined,
      department: parsed.data.department,
    });
    if (dept.error) {
      res.status(400).json({ error: dept.error });
      return;
    }
    departmentId = dept.id;
  }

  const { department: _department, ...rest } = parsed.data;

  const [person] = await db
    .update(peopleTable)
    .set({
      ...rest,
      departmentId,
      ...(body.hrbpId === undefined ? {} : { hrbpId: typeof body.hrbpId === "number" ? body.hrbpId : null }),
      ...(typeof body.isHrbp === "boolean" ? { isHrbp: body.isHrbp } : {}),
      ...(body.status === "active" || body.status === "inactive" ? { status: body.status } : {}),
      ...coordUpdate,
    })
    .where(eq(peopleTable.id, params.data.id))
    .returning();

  if (!person) {
    res.status(404).json({ error: "Person not found" });
    return;
  }

  logAudit(req, "update", "person", person.id, before ?? null, person);
  res.json(toPersonDto(person));
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
      normalized[normalizeImportKey(k)] = v;
    }
    return normalized;
  });

  const headers = detectHeaders(rows[0] ? Object.keys(rows[0]) : []);
  const { valid, skipped } = validateImportRows(
    rows.map((fields, i) => ({ rowNumber: i + 2, fields })),
    headers,
  );

  const deptRows = await db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable);
  const deptByName = new Map(
    deptRows
      .filter((d) => typeof d.name === "string" && d.name)
      .map((d) => [d.name.toLowerCase(), d.id]),
  );

  const validRows = [];
  for (const row of valid) {
    if (headers.department && row.departmentName) {
      const id = deptByName.get(row.departmentName.toLowerCase());
      if (id == null) {
        skipped.push({
          row: row.rowNumber,
          email: row.email,
          reason: `Unknown department "${row.departmentName}" — HR must create it before import`,
        });
        continue;
      }
      validRows.push({ ...row, departmentId: id as number });
    } else if (headers.department && row.departmentName == null) {
      validRows.push({ ...row, departmentId: null as number | null });
    } else {
      validRows.push({ ...row, departmentId: undefined as number | null | undefined });
    }
  }

  if (validRows.length === 0) {
    res.json({ created: 0, updated: 0, skipped });
    return;
  }

  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  const emails = validRows.map((r) => r.email);
  const existingRows: { email?: string }[] = [];
  for (const emailChunk of chunk(emails, UPSERT_CHUNK_SIZE)) {
    const found = await db
      .select({ email: peopleTable.email })
      .from(peopleTable)
      .where(inArray(peopleTable.email, emailChunk));
    existingRows.push(...found);
  }
  const existingEmails = new Set(
    existingRows.map((e) => e.email).filter((e): e is string => typeof e === "string" && e.includes("@")).map((e) => e.toLowerCase()),
  );

  const createdCount = validRows.filter((r) => !existingEmails.has(r.email)).length;
  const updatedCount = validRows.filter((r) => existingEmails.has(r.email)).length;

  const insertValues = validRows.map((r) => ({
    name: r.name,
    email: r.email,
    role: r.role ?? "staff",
    title: headers.title ? r.title ?? null : null,
    departmentId: r.departmentId ?? null,
    homeCity: r.homeCity ?? "",
    homeState: r.homeState ?? "",
    isHrbp: r.isHrbp ?? false,
    status: r.status ?? "active",
    lat: null as number | null,
    lng: null as number | null,
  }));

  const setClause: Record<string, unknown> = {
    name: sql`excluded.name`,
    updatedAt: sql`now()`,
    lat: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.lat END`,
    lng: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.lng END`,
    geocodedAt: sql`CASE WHEN excluded.home_city != people.home_city OR excluded.home_state != people.home_state THEN NULL ELSE people.geocoded_at END`,
  };
  if (headers.role) setClause.role = sql`excluded.role`;
  if (headers.title) setClause.title = sql`excluded.title`;
  if (headers.department) setClause.departmentId = sql`excluded.department_id`;
  if (headers.homeCity) setClause.homeCity = sql`excluded.home_city`;
  if (headers.homeState) setClause.homeState = sql`excluded.home_state`;
  if (headers.isHrbp) setClause.isHrbp = sql`excluded.is_hrbp`;
  if (headers.status) setClause.status = sql`excluded.status`;
  if (!headers.homeCity && !headers.homeState) {
    // Location columns omitted: never null out coordinates.
    setClause.lat = sql`people.lat`;
    setClause.lng = sql`people.lng`;
    setClause.geocodedAt = sql`people.geocoded_at`;
  }

  for (const rowChunk of chunk(insertValues, UPSERT_CHUNK_SIZE)) {
    await db
      .insert(peopleTable)
      .values(rowChunk)
      .onConflictDoUpdate({
        target: peopleTable.email,
        set: setClause as never,
      });
  }

  // Second pass: manager / HRBP emails now that every row exists.
  if (headers.managerEmail || headers.hrbpEmail) {
    const directory = await db.select({
      id: peopleTable.id,
      email: peopleTable.email,
      isHrbp: peopleTable.isHrbp,
      managerId: peopleTable.managerId,
    }).from(peopleTable);
    const byEmail = new Map(
      directory
        .filter((p) => typeof p.email === "string")
        .map((p) => [p.email.toLowerCase(), p]),
    );
    const managerById = new Map(directory.map((p) => [p.id, p.managerId ?? null]));

    for (const row of validRows) {
      const person = byEmail.get(row.email);
      if (!person) continue;
      const patch: { managerId?: number | null; hrbpId?: number | null } = {};

      if (headers.managerEmail) {
        if (!row.managerEmail) {
          patch.managerId = null;
        } else {
          const manager = byEmail.get(row.managerEmail);
          if (!manager) {
            skipped.push({
              row: row.rowNumber,
              email: row.email,
              reason: `Unknown managerEmail "${row.managerEmail}"`,
            });
          } else if (wouldCreateManagerCycle(person.id, manager.id, managerById)) {
            skipped.push({
              row: row.rowNumber,
              email: row.email,
              reason: "Manager assignment would create a reporting cycle",
            });
          } else {
            patch.managerId = manager.id;
            managerById.set(person.id, manager.id);
          }
        }
      }

      if (headers.hrbpEmail) {
        if (!row.hrbpEmail) {
          patch.hrbpId = null;
        } else {
          const hrbp = byEmail.get(row.hrbpEmail);
          if (!hrbp) {
            skipped.push({
              row: row.rowNumber,
              email: row.email,
              reason: `Unknown hrbpEmail "${row.hrbpEmail}"`,
            });
          } else if (!hrbp.isHrbp) {
            skipped.push({
              row: row.rowNumber,
              email: row.email,
              reason: `hrbpEmail "${row.hrbpEmail}" is not marked as an HRBP`,
            });
          } else {
            patch.hrbpId = hrbp.id;
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        await db.update(peopleTable).set(patch).where(eq(peopleTable.id, person.id));
      }
    }
  }

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

  const snapshot = await loadCoverageSnapshot(new Set([params.data.id]));
  const coverageRow = snapshot.rows.find((r) => r.personId === params.data.id);
  const coverage = coverageRow
    ? {
        person: toPersonDto(person as unknown as Parameters<typeof toPersonDto>[0]),
        overdueCount: coverageRow.overdueCount,
        gaps: coverageRow.gaps.map((g) => ({
          kind: g.kind as GapKind,
          label: GAP_LABELS[g.kind],
          daysSince: g.daysSince,
          thresholdDays: g.thresholdDays,
          overdue: g.overdue,
          notApplicable: g.notApplicable,
        })),
      }
    : {
        person: toPersonDto(person as unknown as Parameters<typeof toPersonDto>[0]),
        overdueCount: 0,
        gaps: [],
      };

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
    coverage,
  });
});

// ── GET /people/nearby ─────────────────────────────────────────────────────────
// Returns people within invite_radius_miles of a geocoded city/state.
// Query params: city (required), state (required), excludeIds (optional CSV)

router.get("/people/nearby", async (req, res): Promise<void> => {
  const city = (req.query.city as string | undefined)?.trim();
  const state = (req.query.state as string | undefined)?.trim().toUpperCase();

  if (!city || !state) {
    res.status(400).json({ error: "city and state query params are required" });
    return;
  }

  const radiusMiles = parseInt(
    ((req.query.radiusMiles as string | undefined) ?? await getSetting("invite_radius_miles")) || "50",
    10,
  );

  const excludeParam = (req.query.excludeIds as string | undefined) ?? "";
  const excludeIds = excludeParam
    ? excludeParam.split(",").map(Number).filter(Number.isFinite)
    : [];

  // Geocode the requested location
  const coords = await geocodeCity(city, state);
  if (!coords) {
    res.json({ people: [], radiusMiles, geocodedLat: null, geocodedLng: null });
    return;
  }

  // Fetch all people that have coordinates
  const allPeople = await db
    .select()
    .from(peopleTable)
    .where(isNotNull(peopleTable.lat));

  const nearby = allPeople
    .filter((p) => {
      if (excludeIds.includes(p.id)) return false;
      if (p.lat == null || p.lng == null) return false;
      return haversineMiles(coords.lat, coords.lng, p.lat, p.lng) <= radiusMiles;
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      role: p.role,
      department: null,
      homeCity: p.homeCity,
      homeState: p.homeState,
      distanceMiles: Math.round(haversineMiles(coords.lat, coords.lng, p.lat!, p.lng!) * 10) / 10,
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  res.json({ people: nearby, radiusMiles, geocodedLat: coords.lat, geocodedLng: coords.lng });
});

export default router;
