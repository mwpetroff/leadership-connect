/**
 * One-time startup backfill: geocodes any existing people/events where
 * geocodedAt IS NULL (never attempted). Records that were already attempted
 * but returned no result (geocodedAt is set, lat/lng are null) are not
 * retried — they represent cities Nominatim could not resolve.
 *
 * Runs in the background after the server starts — does not block startup.
 */

import { isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, peopleTable, eventsTable } from "@workspace/db";
import { geocodeCity } from "./geocoding";
import { logger } from "./logger";

async function backfillPeople(): Promise<void> {
  const missing = await db
    .select({ id: peopleTable.id, homeCity: peopleTable.homeCity, homeState: peopleTable.homeState })
    .from(peopleTable)
    .where(isNull(peopleTable.geocodedAt));

  if (missing.length === 0) return;

  logger.info({ count: missing.length }, "geocode-backfill: starting people backfill");

  for (const person of missing) {
    try {
      const coords = await geocodeCity(person.homeCity, person.homeState);
      await db
        .update(peopleTable)
        .set({ lat: coords?.lat ?? null, lng: coords?.lng ?? null, geocodedAt: new Date() })
        .where(eq(peopleTable.id, person.id));
      logger.debug({ personId: person.id, found: coords !== null }, "geocode-backfill: person geocoded");
    } catch (err) {
      logger.warn({ personId: person.id, err }, "geocode-backfill: failed to geocode person, will retry on next startup");
    }
  }

  logger.info({ count: missing.length }, "geocode-backfill: people backfill complete");
}

async function backfillEvents(): Promise<void> {
  const missing = await db
    .select({ id: eventsTable.id, city: eventsTable.city, state: eventsTable.state })
    .from(eventsTable)
    .where(isNull(eventsTable.geocodedAt));

  if (missing.length === 0) return;

  logger.info({ count: missing.length }, "geocode-backfill: starting events backfill");

  for (const event of missing) {
    try {
      const coords = await geocodeCity(event.city, event.state);
      await db
        .update(eventsTable)
        .set({ lat: coords?.lat ?? null, lng: coords?.lng ?? null, geocodedAt: new Date() })
        .where(eq(eventsTable.id, event.id));
      logger.debug({ eventId: event.id, found: coords !== null }, "geocode-backfill: event geocoded");
    } catch (err) {
      logger.warn({ eventId: event.id, err }, "geocode-backfill: failed to geocode event, will retry on next startup");
    }
  }

  logger.info({ count: missing.length }, "geocode-backfill: events backfill complete");
}

/**
 * Kick off the backfill in the background. Sequences people then events
 * through the shared Nominatim rate-limit queue.
 */
export function startGeocodeBackfill(): void {
  backfillPeople()
    .then(() => backfillEvents())
    .catch((err) => logger.error({ err }, "geocode-backfill: unexpected error"));
}
