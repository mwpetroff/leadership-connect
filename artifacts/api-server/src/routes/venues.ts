import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, venuesTable, eventsTable } from "@workspace/db";
import { geocodeCity } from "../lib/geocoding";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

const CreateVenueBody = z.object({
  name:    z.string().min(1),
  address: z.string().min(1),
  city:    z.string().min(1),
  state:   z.string().min(1).max(2).transform(v => v.toUpperCase()),
  zipCode: z.string().optional(),
  webLink: z.string().url().optional().or(z.literal("")),
  notes:   z.string().optional(),
});

const UpdateVenueBody = CreateVenueBody.partial();
const VenueIdParam    = z.object({ id: z.coerce.number().int() });

// ── GET /venues ──────────────────────────────────────────────────────────────
// Returns all venues sorted by usage (primary + evening appearances in events).

router.get("/venues", async (_req, res): Promise<void> => {
  const venues = await db.select().from(venuesTable).orderBy(venuesTable.name);

  // Count event appearances per venue (primary + evening)
  const primary = await db
    .select({ venueId: eventsTable.venueId, count: sql<number>`count(*)::int` })
    .from(eventsTable)
    .where(sql`${eventsTable.venueId} is not null`)
    .groupBy(eventsTable.venueId);

  const evening = await db
    .select({ venueId: eventsTable.eveningVenueId, count: sql<number>`count(*)::int` })
    .from(eventsTable)
    .where(sql`${eventsTable.eveningVenueId} is not null`)
    .groupBy(eventsTable.eveningVenueId);

  const usageMap = new Map<number, number>();
  for (const row of primary)  if (row.venueId)        usageMap.set(row.venueId, (usageMap.get(row.venueId) ?? 0) + row.count);
  for (const row of evening)  if (row.venueId)        usageMap.set(row.venueId, (usageMap.get(row.venueId) ?? 0) + row.count);

  const result = venues
    .map(v => ({ ...v, usageCount: usageMap.get(v.id) ?? 0 }))
    .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

  res.json(result);
});

// ── POST /venues ─────────────────────────────────────────────────────────────

router.post("/venues", async (req, res): Promise<void> => {
  const parsed = CreateVenueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Geocode the venue's city/state
  const coords = await geocodeCity(parsed.data.city, parsed.data.state);

  const [venue] = await db
    .insert(venuesTable)
    .values({
      ...parsed.data,
      webLink: parsed.data.webLink || null,
      lat:         coords?.lat ?? null,
      lng:         coords?.lng ?? null,
      geocodedAt:  coords ? new Date() : null,
    })
    .returning();

  logAudit(req, "create", "venue", venue.id, null, venue);
  res.status(201).json({ ...venue, usageCount: 0 });
});

// ── GET /venues/:id ──────────────────────────────────────────────────────────

router.get("/venues/:id", async (req, res): Promise<void> => {
  const params = VenueIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, params.data.id));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  res.json(venue);
});

// ── PATCH /venues/:id ────────────────────────────────────────────────────────

router.patch("/venues/:id", async (req, res): Promise<void> => {
  const params = VenueIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateVenueBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(venuesTable).where(eq(venuesTable.id, params.data.id));
  if (!before) { res.status(404).json({ error: "Venue not found" }); return; }

  const setData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.webLink === "") setData.webLink = null;

  // Re-geocode if city or state changed
  const cityChanged  = parsed.data.city  !== undefined && parsed.data.city  !== before.city;
  const stateChanged = parsed.data.state !== undefined && parsed.data.state !== before.state;
  if (cityChanged || stateChanged) {
    const coords = await geocodeCity(
      (parsed.data.city  ?? before.city) as string,
      (parsed.data.state ?? before.state) as string,
    );
    setData.lat = coords?.lat ?? null;
    setData.lng = coords?.lng ?? null;
    setData.geocodedAt = coords ? new Date() : null;
  }

  const [venue] = await db
    .update(venuesTable)
    .set(setData)
    .where(eq(venuesTable.id, params.data.id))
    .returning();

  logAudit(req, "update", "venue", venue.id, before, venue);
  res.json(venue);
});

export default router;
